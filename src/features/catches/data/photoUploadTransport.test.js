import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers";
import { createPhotoUploadTransport } from "./photoUploadTransport.js";

test("web photo transport keeps the signed multipart uploader and exposes a harmless queue interface", async () => {
  let request;
  const transport = createPhotoUploadTransport({ platform: () => "web", webFetch: async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ public_id: "asset", resource_type: "image", type: "authenticated", bytes: 4, format: "jpg" }), { status: 200 });
  } });
  const result = await transport.enqueueUpload({ uploadURL: "https://api.cloudinary.com/upload", blob: new Blob(["data"]),
    fileName: "photo.jpg", fields: { api_key: "key", signature: "signature" } });
  assert.equal(result.state, "completed");
  assert.equal(request.options.method, "POST");
  assert.ok(request.options.body instanceof FormData);
  assert.equal((await transport.listPendingUploads()).length, 0);
  assert.deepEqual(await transport.reconcileUploads(), []);
});

test("iOS transport writes to app Data, persists Catch/photo operation identity through native queue, and acknowledges cleanup", async () => {
  const events = [];
  let pendingListener;
  let persisted;
  let acknowledged;
  const files = [];
  const native = {
    async addListener(_name, listener) { pendingListener = listener; return { async remove() {} }; },
    async enqueueUpload(input) { persisted = input; return { state: "uploading" }; },
    async getUploadStatus({ operationId }) { return { operationId, state: "completed", httpStatus: 200 }; },
    async listPendingUploads() { return { uploads: [persisted] }; },
    async reconcileUploads() { return { uploads: [persisted] }; },
    async cancelUpload(input) { events.push(["cancel", input.operationId]); },
    async cancelUploadsForOwner(input) { events.push(["cancel-owner", input.ownerId]); },
    async acknowledgeUpload(input) { acknowledged = input.operationId; },
  };
  const filesystem = {
    async mkdir(input) { files.push(["mkdir", input.directory]); },
    async writeFile(input) { files.push(["write", input.path, input.directory, input.data]); },
    async getUri(input) { return { uri: `file:///app/${input.path}` }; },
  };
  const transport = createPhotoUploadTransport({ platform: () => "ios", native, filesystem });
  const result = await transport.enqueueUpload({ operationId: "op-1", ownerId: "user-1", catchId: "catch-1", photoId: "photo-1",
    contentType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]), sha256: "a".repeat(64),
    uploadURL: "https://api.cloudinary.com/upload", fields: { signature: "signed" } });
  assert.equal(result.state, "completed");
  assert.equal(persisted.operationId, "op-1");
  assert.equal(persisted.ownerId, "user-1");
  assert.equal(persisted.catchId, "catch-1");
  assert.equal(persisted.photoId, "photo-1");
  assert.equal(persisted.contentType, "image/jpeg");
  assert.equal(persisted.sha256, "a".repeat(64));
  assert.equal(persisted.filePath, "file:///app/chytnu-photo-uploads/op-1.jpg");
  assert.deepEqual(files.map((entry) => entry.slice(0, 3)), [["mkdir", "DATA"], ["write", "chytnu-photo-uploads/op-1.jpg", "DATA"]]);
  assert.deepEqual(await transport.listPendingUploads(), [persisted]);
  await transport.acknowledgeUpload({ operationId: "op-1" });
  assert.equal(acknowledged, "op-1");
  pendingListener({ operationId: "op-1", state: "completed" });
});

test("iOS transport resumes an active background task without polling or starting a duplicate", async () => {
  let starts = 0;
  const transport = createPhotoUploadTransport({ platform: () => "ios", filesystem: {}, native: {
    async addListener() { return { async remove() {} }; },
    async enqueueUpload() { starts += 1; return { state: "uploading" }; },
    async getUploadStatus({ operationId }) { return { operationId, state: "uploading" }; },
  } });
  const status = await transport.getUploadStatus({ operationId: "operation-1" });
  assert.equal(status.state, "uploading");
  assert.equal(starts, 0);
});


test("native completion missed during suspension is recovered on foreground without another upload", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  let state = "uploading";
  let queued;
  const started = new Promise((resolve) => { queued = resolve; });
  let starts = 0;
  try {
    const transport = createPhotoUploadTransport({ platform: () => "ios", filesystem: {
      async mkdir() {}, async writeFile() {}, async getUri() { return { uri: "file:///app/photo.jpg" }; },
    }, native: {
      async addListener() { return { async remove() {} }; },
      async enqueueUpload() { starts += 1; queued(); return { state }; },
      async getUploadStatus() { return { state, httpStatus: 200 }; },
    } });
    const result = transport.enqueueUpload({ operationId: "resume", ownerId: "owner", catchId: "catch", photoId: "photo",
      contentType: "image/jpeg", bytes: new Uint8Array([1]), fields: {} });
    await started;
    await new Promise((resolve) => setImmediate(resolve));
    state = "completed";
    globalThis.window.dispatchEvent(new Event("focus"));
    assert.equal((await result).state, "completed");
    assert.equal(starts, 1);
  } finally { globalThis.window = previousWindow; }
});
