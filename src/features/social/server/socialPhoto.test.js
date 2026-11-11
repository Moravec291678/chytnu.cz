import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { v2 as cloudinary } from "cloudinary";
import { createSocialPhotoService, sanitizeSocialPhoto, MAX_SOCIAL_PHOTO_BYTES } from "./socialPhoto.js";

const identity = { uid: "owner_a", catchId: "catch_a", photoId: "photo_a" };
const publicId = "chytnucz/users/owner_a/catches/catch_a/photos/photo_a/original";
const photo = { id: "photo_a", ownerId: "owner_a", type: "image/jpeg", size: 5000,
  cloud: { provider: "cloudinary", state: "synced", objectKey: "users/owner_a/catches/catch_a/photos/photo_a/original", sha256: "a".repeat(64) } };
const receipt = { version: "123", sha256: photo.cloud.sha256, transformationVersion: 1, width: 100, height: 80 };
function jpeg({ width = 100, height = 80, marker = 0xc0 } = {}) {
  return new Uint8Array([255, 216, 255, 225, 0, 12, ...Buffer.from("GPS SECRET"),
    255, marker, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0,
    255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 19, 20, 255, 217]);
}
function fixture({ original = {}, resource = {}, response, address } = {}) {
  const calls = [];
  const sdk = async () => ({
    api: { async resource(id, options) {
      calls.push({ method: "resource", id, options });
      return { public_id: publicId, resource_type: "image", type: "authenticated", format: "jpg", bytes: photo.size,
        context: { custom: { sha256: photo.cloud.sha256 } }, ...original };
    } },
    uploader: { async explicit(id, options) {
      calls.push({ method: "explicit", id, options });
      return { public_id: publicId, resource_type: "image", type: "authenticated", version: 123,
        eager: [{ format: "jpg", width: 100, height: 80, bytes: 1000, secure_url: "https://must-not-use.test" }], ...resource };
    } },
    url(id, options) {
      calls.push({ method: "url", id, options });
      return address ?? cloudinary.url(id, { ...options, cloud_name: "fixture", api_secret: "synthetic-unit-secret" });
    },
  });
  const service = createSocialPhotoService({ sdk, fetchImpl: async (url, options) => {
    calls.push({ method: "fetch", url, options });
    return response ?? new Response(jpeg(), { headers: { "content-type": "image/jpeg" } });
  } });
  return { service, calls };
}

test("shared photo preparation verifies immutable owner-bound original before one approved eager derivative", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.prepare(identity, photo), receipt);
  assert.deepEqual(calls.map(c => c.method), ["resource", "explicit"]);
  assert.equal(calls[0].id, publicId); assert.equal(calls[0].options.type, "authenticated");
  const eager = calls[1].options;
  assert.equal(eager.type, "authenticated"); assert.equal(eager.eager_async, false);
  assert.equal(cloudinary.utils.build_eager(eager.eager), "c_limit,fl_strip_profile,h_1280,q_80,w_1280/jpg");
});

test("shared photo validates ownership, IDs, MIME, source key and SHA before any provider access", async () => {
  const { service, calls } = fixture();
  for (const bad of [{ ...photo, ownerId: "other" }, { ...photo, deleted: true }, { ...photo, id: "other" },
    { ...photo, type: "image/png" }, { ...photo, size: 0 }, { ...photo, cloud: { ...photo.cloud, state: "pending" } },
    { ...photo, cloud: { ...photo.cloud, objectKey: "users/other/original" } }, { ...photo, cloud: { ...photo.cloud, sha256: "not-a-hash" } }]) {
    await assert.rejects(service.prepare(identity, bad), /invalid_shared_photo/);
    await assert.rejects(service.delivery(identity, bad, receipt), /invalid_shared_photo/);
  }
  await assert.rejects(service.prepare({ ...identity, uid: "../other" }, photo));
  await assert.rejects(service.prepare({ ...identity, catchId: "catch/path" }, photo));
  assert.equal(calls.length, 0);
});

test("mismatched provider original does not generate any derivative", async () => {
  for (const original of [{ public_id: "other" }, { type: "upload" }, { resource_type: "raw" }, { format: "png" },
    { bytes: 4000 }, { context: { custom: { sha256: "b".repeat(64) } } }]) {
    const { service, calls } = fixture({ original });
    await assert.rejects(service.prepare(identity, photo), /photo_unavailable/);
    assert.deepEqual(calls.map(c => c.method), ["resource"]);
  }
});

test("preparation rejects missing, oversized, unsupported or unbounded eager result", async () => {
  for (const resource of [{ public_id: "other" }, { type: "upload" }, { version: "../original" }, { eager: [] },
    { eager: [{ format: "jpg", bytes: 100, width: 1281, height: 100 }] },
    { eager: [{ format: "jpg", bytes: MAX_SOCIAL_PHOTO_BYTES + 1, width: 100, height: 80 }] },
    { eager: [{ format: "png", bytes: 100, width: 100, height: 80 }] }]) {
    await assert.rejects(fixture({ resource }).service.prepare(identity, photo), /photo_unavailable/);
  }
});

test("delivery uses only exact signed authenticated derivative, strips EXIF and returns no URL", async () => {
  const { service, calls } = fixture();
  const bytes = await service.delivery(identity, photo, receipt);
  assert.ok(bytes instanceof Uint8Array); assert.doesNotMatch(Buffer.from(bytes).toString("latin1"), /GPS SECRET/);
  assert.deepEqual(calls.map(c => c.method), ["url", "fetch"]); // No explicit/regeneration on a view.
  const url = new URL(calls[1].url);
  assert.match(url.pathname, /\/image\/authenticated\/s--[\w-]+--\/c_limit,fl_strip_profile,h_1280,q_80,w_1280\/v123\//);
  assert.ok(url.pathname.endsWith(`/${publicId}.jpg`));
  assert.equal(calls[1].options.redirect, "error"); assert.equal(calls[1].options.cache, "no-store");
});

test("delivery rejects stale source SHA, future transform versions and invalid receipts before access", async () => {
  const { service, calls } = fixture();
  for (const bad of [null, { ...receipt, sha256: "b".repeat(64) }, { ...receipt, transformationVersion: 2 },
    { ...receipt, version: "../original" }, { ...receipt, width: 1281 }]) await assert.rejects(service.delivery(identity, photo, bad), /invalid_shared_photo/);
  assert.equal(calls.length, 0);
});

test("delivery fails closed for original URLs, changed transform, unsafe hosts or redirects", async () => {
  for (const address of ["https://res.cloudinary.com/fixture/image/authenticated/s--x--/v123/" + publicId + ".jpg",
    "https://attacker.test/asset", "http://res.cloudinary.com/asset", "https://user:secret@res.cloudinary.com/asset",
    "https://res.cloudinary.com:444/asset", "https://res.cloudinary.com/fixture/image/upload/s--x--/asset.jpg"]) {
    const { service, calls } = fixture({ address });
    await assert.rejects(service.delivery(identity, photo, receipt), /photo_unavailable/);
    assert.equal(calls.filter(c => c.method === "fetch").length, 0);
  }
});

test("delivery independently bounds content size, type, decoded frame and receipt dimensions", async () => {
  for (const response of [new Response(jpeg(), { headers: { "content-type": "image/png" } }),
    new Response(jpeg(), { headers: { "content-type": "image/jpeg", "content-length": MAX_SOCIAL_PHOTO_BYTES + 1 } }),
    new Response(new Uint8Array(MAX_SOCIAL_PHOTO_BYTES + 1), { headers: { "content-type": "image/jpeg" } }),
    new Response(jpeg({ width: 1281 }), { headers: { "content-type": "image/jpeg" } }),
    new Response(jpeg({ width: 101 }), { headers: { "content-type": "image/jpeg" } }),
    new Response(jpeg({ marker: 0xc2 }), { headers: { "content-type": "image/jpeg" } })]) {
    await assert.rejects(fixture({ response }).service.delivery(identity, photo, receipt), /photo_unavailable/);
  }
  assert.throws(() => sanitizeSocialPhoto(new Uint8Array([255, 216, 255, 217])));
});

test("production service respects disabled photo provider without Cloudinary access", async () => {
  const service = createSocialPhotoService({ env: { PHOTO_CLOUD_PROVIDER: "none" } });
  await assert.rejects(service.prepare(identity, photo), /photo_unavailable/);
  await assert.rejects(service.delivery(identity, photo, receipt), /photo_unavailable/);
});
