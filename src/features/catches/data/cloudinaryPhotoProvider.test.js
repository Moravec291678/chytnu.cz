import assert from "node:assert/strict";
import test from "node:test";
import { cloudinaryPhotoProvider, createCloudinaryPhotoProvider } from "./cloudinaryPhotoProvider.js";
import { createPhotoObjectKey } from "./photoCloudProvider.js";

const ownerId = "user-abc";
const catchId = "catch-123";
const photoId = "photo-456";
const objectKey = createPhotoObjectKey(ownerId, catchId, photoId);
const blob = new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" });
const sha256 = "a".repeat(64);

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; }, async blob() { return blob; } };
}

test("Cloudinary provider has the abstraction contract; local default remains none until production bootstrap", async () => {
  assert.equal(cloudinaryPhotoProvider.id, "cloudinary");
  for (const method of ["isAvailable", "upload", "download", "delete", "getMetadata"]) assert.equal(typeof cloudinaryPhotoProvider[method], "function");
  const provider = createCloudinaryPhotoProvider({ fetchImpl: async () => jsonResponse({ enabled: false }) });
  assert.equal(await provider.isAvailable(), false);
});

test("signed upload uses only the server grant, fixed image endpoint, and verifies Cloudinary response", async () => {
  const seen = [];
  const provider = createCloudinaryPhotoProvider({ fetchImpl: async (url, options) => {
    seen.push({ url, options });
    return jsonResponse({ public_id: `chytnucz/${objectKey}`, resource_type: "image", type: "authenticated", bytes: blob.size, format: "jpg" });
  } });
  let verified = false;
  const result = await provider.upload({
    ownerId, catchId, photoId, objectKey, blob, size: blob.size, contentType: blob.type, sha256,
    async requestUploadGrant(body) {
      assert.deepEqual(body, { catchId, photoId, size: blob.size, contentType: blob.type, sha256 });
      return { cloudName: "test-cloud", apiKey: "1234567890", resourceType: "image", timestamp: 1_800_000_000,
        signature: "b".repeat(64), params: { public_id: `chytnucz/${objectKey}`, type: "authenticated", overwrite: true } };
    },
    async requestUploadVerification(body) {
      verified = true;
      assert.deepEqual(body, { catchId, photoId, bytes: blob.size, format: "jpg" });
      return { verified: true, bytes: blob.size, format: "jpg" };
    },
  });
  assert.deepEqual(result, { objectKey });
  assert.equal(verified, true);
  assert.equal(seen[0].url, "https://api.cloudinary.com/v1_1/test-cloud/image/upload");
  assert.equal(seen[0].options.method, "POST");
  const form = seen[0].options.body;
  assert.equal(form.get("type"), "authenticated");
  assert.equal(form.get("public_id"), `chytnucz/${objectKey}`);
  assert.equal(form.get("file").size, blob.size);
  assert.equal(form.has("api_secret"), false);
});

test("ten photos in one Catch receive independent deterministic signed uploads", async () => {
  const uploaded = [];
  const provider = createCloudinaryPhotoProvider({ fetchImpl: async (url, options) => {
    const form = options.body;
    const publicId = form.get("public_id");
    uploaded.push(publicId);
    return jsonResponse({ public_id: publicId, resource_type: "image", type: "authenticated", bytes: blob.size, format: "jpg" });
  } });
  for (let index = 0; index < 10; index += 1) {
    const id = `photo-${index}`;
    const key = createPhotoObjectKey(ownerId, catchId, id);
    await provider.upload({
      ownerId, catchId, photoId: id, objectKey: key, blob, size: blob.size, contentType: blob.type, sha256,
      requestUploadGrant: async () => ({ cloudName: "test-cloud", apiKey: "1234567890", resourceType: "image", timestamp: 1_800_000_000,
        signature: "b".repeat(64), params: { public_id: `chytnucz/${key}`, type: "authenticated", overwrite: true } }),
      requestUploadVerification: async () => ({ verified: true, bytes: blob.size, format: "jpg" }),
    });
  }
  assert.equal(uploaded.length, 10);
  assert.equal(new Set(uploaded).size, 10);
});

test("provider rejects a mismatched signed path and classifies Cloudinary upload failures for retry", async () => {
  const provider = createCloudinaryPhotoProvider({ fetchImpl: async () => jsonResponse({ error: { message: "internal detail" } }, 420) });
  await assert.rejects(provider.upload({
    ownerId, catchId, photoId, objectKey, blob, size: blob.size, contentType: blob.type, sha256,
    requestUploadGrant: async () => ({ cloudName: "test-cloud", apiKey: "1234567890", resourceType: "image", timestamp: 1_800_000_000,
      signature: "b".repeat(64), params: { public_id: "foreign/path", type: "authenticated", overwrite: true } }),
    requestUploadVerification: async () => ({ verified: true }),
  }), { code: "invalid_photo_identity" });

  const failing = createCloudinaryPhotoProvider({ fetchImpl: async () => jsonResponse({ error: { message: "must not escape" } }, 420) });
  await assert.rejects(failing.upload({
    ownerId, catchId, photoId, objectKey, blob, size: blob.size, contentType: blob.type, sha256,
    requestUploadGrant: async () => ({ cloudName: "test-cloud", apiKey: "1234567890", resourceType: "image", timestamp: 1_800_000_000,
      signature: "b".repeat(64), params: { public_id: `chytnucz/${objectKey}`, type: "authenticated", overwrite: true } }),
    requestUploadVerification: async () => ({ verified: true }),
  }), (error) => error.code === "cloudinary_rate_limited" && !error.message.includes("must not escape"));
});

test("authenticated delivery grant is fetched then downloaded; delete delegates IDs only to server", async () => {
  const calls = [];
  const provider = createCloudinaryPhotoProvider({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url === "https://api.cloudinary.com/v1_1/test-cloud/image/download?sig=short") return jsonResponse({}, 200);
    return jsonResponse({ deleted: true });
  } });
  const downloaded = await provider.download({ ownerId, catchId, photoId, objectKey,
    requestDownloadGrant: async (body) => { assert.deepEqual(body, { catchId, photoId }); return { url: "https://api.cloudinary.com/v1_1/test-cloud/image/download?sig=short" }; },
  });
  assert.equal(downloaded.size, blob.size);
  let deleteRequest;
  const deleted = await provider.delete({ ownerId, catchId, photoId, provider: "cloudinary", objectKey,
    requestDeleteGrant: async (body) => { deleteRequest = body; return { deleted: true }; },
  });
  assert.deepEqual(deleteRequest, { catchId, photoId });
  assert.deepEqual(deleted, { deleted: true });
  assert.equal(calls[0].options.credentials, "omit");
});
