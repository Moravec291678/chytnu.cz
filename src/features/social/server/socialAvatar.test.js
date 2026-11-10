import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { createSocialAvatarService, MAX_SOCIAL_AVATAR_BYTES, sanitizeSocialAvatar } from "./socialAvatar.js";

function jpeg({ width = 100, height = 80, metadata = true, marker = 0xc0 } = {}) {
  return new Uint8Array([0xff, 0xd8,
    ...(metadata ? [0xff, 0xe1, 0, 12, ...Buffer.from("GPS SECRET")] : []),
    0xff, marker, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 19, 20, 0xff, 0xd9]);
}
const assetId = "a".repeat(32);
const base64 = bytes => Buffer.from(bytes).toString("base64");
function fixture({ response, downloadUrl = "https://res.cloudinary.com/private/signed" } = {}) {
  const calls = [];
  const sdk = async () => ({
    uploader: {
      async upload(source, options) { calls.push({ type: "upload", source, options }); return { version: 123, secure_url: "https://never-return-this" }; },
      async destroy(publicId, options) { calls.push({ type: "destroy", publicId, options }); return { result: "ok" }; },
    },
    utils: { private_download_url(publicId, format, options) { calls.push({ type: "delivery", publicId, format, options }); return downloadUrl; } },
  });
  const service = createSocialAvatarService({ sdk, fetchImpl: async (url, options) => {
    calls.push({ type: "fetch", url, options });
    return response ?? new Response(jpeg(), { headers: { "Content-Type": "image/jpeg" } });
  } });
  return { calls, service };
}
test("social avatar upload strips private metadata before authenticated Cloudinary storage", async () => {
  const { calls, service } = fixture();
  assert.deepEqual(await service.save("owner_a", base64(jpeg()), assetId), { version: "123" });
  const upload = calls[0];
  assert.equal(upload.options.public_id, "chytnucz/users/owner_a/profile/avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(upload.options.type, "authenticated");
  assert.equal(upload.options.overwrite, false);
  assert.equal(upload.options.format, "jpg");
  assert.doesNotMatch(Buffer.from(upload.source.split(",")[1], "base64").toString("latin1"), /GPS SECRET/);
});
test("production avatar upload and delivery respect disabled existing photo provider", async () => {
  const service = createSocialAvatarService({ env: { PHOTO_CLOUD_PROVIDER: "none" } });
  await assert.rejects(() => service.save("owner_a", base64(jpeg()), assetId), /avatar_unavailable/);
  await assert.rejects(() => service.delivery("owner_a", assetId), /avatar_unavailable/);
});
test("social avatar validates UID, canonical base64, encoding, size and dimensions before provider call", async () => {
  const { calls, service } = fixture();
  for (const value of ["", "data:image/jpeg;base64,abc", "a===", "####", base64(new Uint8Array(MAX_SOCIAL_AVATAR_BYTES + 1)),
    base64(jpeg({ width: 513 })), base64(jpeg({ height: 513 })), base64(jpeg({ width: 0 })), base64(jpeg({ marker: 0xc3 }))]) {
    await assert.rejects(() => service.save("owner_a", value, assetId), /invalid_avatar/);
  }
  await assert.rejects(() => service.save("../another", base64(jpeg()), assetId));
  assert.equal(calls.length, 0);
});
test("social avatar delivery is private, bounded, metadata-free bytes without returned URL", async () => {
  const { calls, service } = fixture();
  const bytes = await service.delivery("owner_a", assetId);
  assert.ok(bytes instanceof Uint8Array);
  assert.doesNotMatch(Buffer.from(bytes).toString("latin1"), /GPS SECRET/);
  assert.equal(calls[0].publicId, "chytnucz/users/owner_a/profile/avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(calls[0].options.type, "authenticated");
  assert.ok(calls[0].options.expires_at <= Math.floor(Date.now() / 1000) + 60);
  assert.equal(calls[1].options.redirect, "error");
  assert.equal(calls[1].options.cache, "no-store");
});
test("social avatar rejects unsafe download hosts, unexpected types and oversized streams", async () => {
  for (const downloadUrl of ["http://res.cloudinary.com/asset", "https://attacker.test/asset", "https://user:password@res.cloudinary.com/asset", "https://res.cloudinary.com:444/asset"]) {
    const { calls, service } = fixture({ downloadUrl });
    await assert.rejects(() => service.delivery("a", assetId), /avatar_unavailable/);
    assert.equal(calls.length, 1);
  }
  for (const response of [new Response(jpeg(), { headers: { "Content-Type": "image/png" } }),
    new Response(jpeg(), { headers: { "Content-Type": "image/jpeg", "Content-Length": MAX_SOCIAL_AVATAR_BYTES + 1 } }),
    new Response(new Uint8Array(MAX_SOCIAL_AVATAR_BYTES + 1), { headers: { "Content-Type": "image/jpeg" } })]) {
    await assert.rejects(() => fixture({ response }).service.delivery("a", assetId), /avatar_unavailable/);
  }
});
test("social avatar deletion uses the same owner-bound authenticated resource", async () => {
  const { calls, service } = fixture(); await service.remove("a", assetId);
  assert.deepEqual(calls, [{ type: "destroy", publicId: "chytnucz/users/a/profile/avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", options: { resource_type: "image", type: "authenticated", invalidate: true } }]);
});
test("social avatar rejects malformed JPEG and unsupported progressive scans", () => {
  assert.throws(() => sanitizeSocialAvatar(new Uint8Array([255, 216, 255, 217])), /invalid_avatar/);
  const progressive = jpeg({ marker: 0xc2 });
  const secondScan = new Uint8Array([...progressive.slice(0, -2), 0xff, 0xda, 0, 2, 0, 0xff, 0xd9]);
  assert.throws(() => sanitizeSocialAvatar(secondScan), /invalid_avatar/);
});
