import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { cloudinaryPhotoProvider, createCloudinaryPhotoProvider } from "./cloudinaryPhotoProvider.js";
import { createPhotoObjectKey, sha256Blob } from "./photoCloudProvider.js";

const ownerId = "user-abc";
const catchId = "catch-123";
const photoId = "photo-456";
const objectKey = createPhotoObjectKey(ownerId, catchId, photoId);
const blob = new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" });
const sha256 = await sha256Blob(blob);

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
  const stages = [];
  const diagnostics = [];
  const result = await provider.upload({
    ownerId, catchId, photoId, objectKey, blob, size: blob.size, contentType: blob.type, sha256,
    onStage: async (stage) => stages.push(stage),
    onDiagnostic: (stage, details) => diagnostics.push({ stage, ...details }),
    async requestUploadGrant(body) {
      assert.deepEqual(body, { catchId, photoId, size: blob.size, contentType: blob.type, sha256 });
      return { cloudName: "test-cloud", apiKey: "1234567890", resourceType: "image", timestamp: 1_800_000_000,
        signature: "b".repeat(64), params: { public_id: `chytnucz/${objectKey}`, type: "authenticated", overwrite: true } };
    },
    async requestUploadVerification(body) {
      verified = true;
      assert.deepEqual(body, { catchId, photoId, bytes: blob.size, format: "jpg", sha256 });
      return { verified: true, bytes: blob.size, format: "jpg" };
    },
  });
  assert.deepEqual(result, { objectKey });
  assert.deepEqual(stages, ["signing", "uploading", "verifying"]);
  assert.deepEqual(diagnostics.map((item) => item.stage), ["cloud_upload_started", "cloud_upload_response", "cloud_upload_pass"]);
  assert.equal(diagnostics[1].bytes, blob.size);
  assert.equal(diagnostics[1].httpStatus, 200);
  assert.doesNotMatch(JSON.stringify(diagnostics), /signature|public_id|user-abc|apiKey/);
  assert.equal(verified, true);
  assert.equal(seen[0].url, "https://api.cloudinary.com/v1_1/test-cloud/image/upload");
  assert.equal(seen[0].options.method, "POST");
  const form = seen[0].options.body;
  assert.equal(form.get("type"), "authenticated");
  assert.equal(form.get("public_id"), `chytnucz/${objectKey}`);
  assert.equal(form.get("file").size, blob.size);
  assert.ok(form.get("file") instanceof Blob);
  assert.notEqual(form.get("file"), blob);
  assert.equal(form.get("file").type, "image/jpeg");
  assert.equal(await sha256Blob(form.get("file")), sha256);
  assert.deepEqual(new Uint8Array(await form.get("file").arrayBuffer()), new Uint8Array(await blob.arrayBuffer()));
  assert.equal(form.has("api_secret"), false);
});

test("upload copies IndexedDB Blob and File bytes into typed memory Blobs for supported formats", async () => {
  const cases = [
    { type: "image/jpeg", format: "jpg", name: "legacy.jpg", source: new File(["legacy jpeg"], "legacy.jpg", { type: "image/jpeg" }) },
    { type: "image/png", format: "png", name: "photo.png", source: new File(["png bytes"], "photo.png", { type: "image/png" }) },
    { type: "image/webp", format: "webp", name: "photo.webp", source: new File(["webp bytes"], "photo.webp", { type: "image/webp" }) },
    { type: "image/jpeg", format: "jpg", name: "normalized-heic.jpg", source: new Blob(["normalized HEIC pixels"], { type: "image/jpeg" }) },
  ];
  for (const [index, item] of cases.entries()) {
    const id = `copy-${index}`;
    const key = createPhotoObjectKey(ownerId, catchId, id);
    let appended;
    const provider = createCloudinaryPhotoProvider({ fetchImpl: async (_url, options) => {
      appended = options.body.get("file");
      return jsonResponse({ public_id: `chytnucz/${key}`, resource_type: "image", type: "authenticated", bytes: item.source.size, format: item.format });
    } });
    const digest = await sha256Blob(item.source);
    await provider.upload({
      ownerId, catchId, photoId: id, objectKey: key, blob: item.source,
      size: item.source.size, contentType: item.type, sha256: digest,
      requestUploadGrant: async () => ({ cloudName: "test-cloud", apiKey: "1234567890", resourceType: "image", timestamp: 1_800_000_000,
        signature: "b".repeat(64), params: { public_id: `chytnucz/${key}`, type: "authenticated", overwrite: true } }),
      requestUploadVerification: async ({ bytes, format }) => ({ verified: true, bytes, format }),
    });
    assert.notEqual(appended, item.source);
    assert.equal(appended.type, item.type);
    assert.equal(appended.size, item.source.size);
    assert.equal(await sha256Blob(appended), digest);
    assert.deepEqual(new Uint8Array(await appended.arrayBuffer()), new Uint8Array(await item.source.arrayBuffer()));
  }
});

test("File restored from IndexedDB is copied before it enters Cloudinary FormData", async () => {
  const indexedDB = new IDBFactory();
  const open = indexedDB.open(`photo-file-${crypto.randomUUID()}`, 1);
  open.onupgradeneeded = () => open.result.createObjectStore("photos");
  const db = await new Promise((resolve, reject) => {
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const source = new File([new Uint8Array([0xff, 0xd8, 0x01, 0x02])], "photo.jpg", { type: "image/jpeg" });
  const write = db.transaction("photos", "readwrite");
  write.objectStore("photos").put(source, "legacy");
  await new Promise((resolve, reject) => {
    write.oncomplete = resolve;
    write.onerror = () => reject(write.error);
  });
  const read = db.transaction("photos", "readonly");
  const restored = await new Promise((resolve, reject) => {
    const request = read.objectStore("photos").get("legacy");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  assert.ok(restored instanceof Blob);
  assert.equal(restored.size, source.size);
  const digest = await sha256Blob(restored);
  const key = createPhotoObjectKey(ownerId, catchId, "indexeddb-file");
  let uploaded;
  const provider = createCloudinaryPhotoProvider({ fetchImpl: async (_url, options) => {
    uploaded = options.body.get("file");
    return jsonResponse({ public_id: `chytnucz/${key}`, resource_type: "image", type: "authenticated", bytes: restored.size, format: "jpg" });
  } });
  await provider.upload({ ownerId, catchId, photoId: "indexeddb-file", objectKey: key, blob: restored,
    size: restored.size, contentType: "image/jpeg", sha256: digest,
    requestUploadGrant: async () => ({ cloudName: "test-cloud", apiKey: "1234567890", resourceType: "image", timestamp: 1_800_000_000,
      signature: "b".repeat(64), params: { public_id: `chytnucz/${key}`, type: "authenticated", overwrite: true } }),
    requestUploadVerification: async ({ bytes, format }) => ({ verified: true, bytes, format }),
  });
  assert.notEqual(uploaded, restored);
  assert.equal(uploaded.size, restored.size);
  assert.equal(uploaded.type, "image/jpeg");
  assert.equal(await sha256Blob(uploaded), digest);
  assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), new Uint8Array(await source.arrayBuffer()));
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

test("expired delivery URL is replaced with one fresh authenticated grant", async () => {
  let grants = 0;
  const urls = [];
  const provider = createCloudinaryPhotoProvider({ fetchImpl: async (url) => {
    urls.push(url);
    return urls.length === 1 ? jsonResponse({}, 401) : jsonResponse({}, 200);
  } });
  const result = await provider.download({ ownerId, catchId, photoId, objectKey,
    requestDownloadGrant: async () => {
      grants += 1;
      return { url: `https://api.cloudinary.com/v1_1/test-cloud/image/download?grant=${grants}` };
    },
  });
  assert.equal(result.size, blob.size);
  assert.equal(grants, 2);
  assert.notEqual(urls[0], urls[1]);
});

test("empty or mismatched Cloudinary response cannot reach verification", async () => {
  for (const bytes of [0, blob.size + 1]) {
    let verified = false;
    const provider = createCloudinaryPhotoProvider({ fetchImpl: async () => jsonResponse({
      public_id: `chytnucz/${objectKey}`, resource_type: "image", type: "authenticated", bytes, format: "jpg",
    }) });
    await assert.rejects(provider.upload({ ownerId, catchId, photoId, objectKey, blob,
      size: blob.size, contentType: blob.type, sha256,
      requestUploadGrant: async () => ({ cloudName: "test-cloud", apiKey: "1234567890", resourceType: "image", timestamp: 1_800_000_000,
        signature: "b".repeat(64), params: { public_id: `chytnucz/${objectKey}`, type: "authenticated", overwrite: true } }),
      requestUploadVerification: async () => { verified = true; },
    }), { code: "cloudinary_response_mismatch" });
    assert.equal(verified, false);
  }
});

test("interrupted upload recovery verifies the same SHA-256 without another Cloudinary upload", async () => {
  let networkCalls = 0;
  const provider = createCloudinaryPhotoProvider({ fetchImpl: async () => { networkCalls += 1; throw new Error("unexpected upload"); } });
  const input = { ownerId, catchId, photoId, objectKey, size: blob.size, contentType: blob.type, sha256 };
  const verified = await provider.recoverUpload({ ...input, requestUploadVerification: async (body) => {
    assert.deepEqual(body, { catchId, photoId, bytes: blob.size, format: "jpg", sha256 });
    return { verified: true, bytes: blob.size, format: "jpg" };
  } });
  assert.equal(verified, true);
  assert.equal(networkCalls, 0);
  for (const [status, code] of [[404, "asset_not_found"], [409, "upload_response_mismatch"]]) {
    assert.equal(await provider.recoverUpload({ ...input, requestUploadVerification: async () => {
      throw Object.assign(new Error("not recoverable"), { status, code });
    } }), false);
  }
  await assert.rejects(provider.recoverUpload({ ...input, objectKey: "foreign", requestUploadVerification: async () => ({ verified: true }) }),
    { code: "invalid_photo_identity" });
});
