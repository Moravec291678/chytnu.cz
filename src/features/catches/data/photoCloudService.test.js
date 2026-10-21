import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { catchRepository, outboxRepository, photoCloudOutboxRepository } from "./catchRepository.js";
import { getGalleryMissingMessage } from "./catchGallery.js";
import { getPrimaryAvailablePhoto } from "./catchPhotos.js";
import { createPhotoCloudService } from "./photoCloudService.js";
import { createAuthenticatedPhotoEndpointCaller } from "./photoCloudService.js";
import { createCloudinaryPhotoProvider } from "./cloudinaryPhotoProvider.js";
import { createPhotoObjectKey, nonePhotoCloudProvider, PHOTO_CLOUD_STATE } from "./photoCloudProvider.js";

const databaseName = "chytnu-local";
const fixedNow = Date.parse("2026-10-21T12:00:00.000Z");

async function resetDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Testovací IndexedDB zůstala otevřená."));
  });
}

function makePhoto(id, text = id) {
  const blob = new Blob([text], { type: "image/jpeg" });
  return { id, name: `${id}.jpg`, type: blob.type, size: blob.size, blob, focalX: 0.5, focalY: 0.5, zoom: 1,
    cloud: { state: PHOTO_CLOUD_STATE.LOCAL_ONLY, provider: null, objectKey: null, sha256: null } };
}

function makeCatch(ownerId, id, photos, primaryPhotoId = photos[0]?.id ?? null) {
  const now = new Date(fixedNow).toISOString();
  return {
    schemaVersion: 1, id, ownerId, createdAt: now, updatedAt: now, caughtAt: now,
    species: "Kapr obecný", speciesKey: "carp", speciesLatin: null, weightKg: null,
    lengthCm: null, girthCm: null, fightMinutes: null, locationName: "Labe", waterNumber: null,
    gpsLocation: "", waterDepthM: null, bottomType: null, tripId: null, method: null,
    baits: [], result: "released", photos, primaryPhotoId, notes: "", isFavorite: false,
    sync: { status: "local", revision: 1 },
  };
}

function createFakeProvider(id = "fake") {
  const objects = new Map();
  const calls = { uploads: [], downloads: [], deletes: [], stages: [] };
  const failures = { upload: 0, uploadAfterWrite: 0, download: 0, delete: 0 };
  return {
    id, objects, calls, failures, available: true,
    async isAvailable() { return this.available; },
    async upload(input) {
      calls.uploads.push(input);
      for (const stage of ["signing", "uploading"]) {
        await input.onStage?.(stage);
        calls.stages.push(stage);
      }
      if (failures.upload > 0) { failures.upload -= 1; throw new Error("network upload failed"); }
      objects.set(input.objectKey, { blob: input.blob, sha256: input.sha256, contentType: input.contentType });
      if (failures.uploadAfterWrite > 0) { failures.uploadAfterWrite -= 1; throw new Error("upload response lost"); }
      await input.onStage?.("verifying");
      calls.stages.push("verifying");
      return { objectKey: input.objectKey };
    },
    async download(input) {
      calls.downloads.push(input);
      if (failures.download > 0) { failures.download -= 1; throw new Error("network download failed"); }
      return objects.get(input.objectKey)?.blob ?? null;
    },
    async delete(input) {
      calls.deletes.push(input);
      if (failures.delete > 0) { failures.delete -= 1; throw new Error("network delete failed"); }
      objects.delete(input.objectKey);
      return { deleted: true };
    },
    async getMetadata({ objectKey }) {
      const object = objects.get(objectKey);
      return object ? { size: object.blob.size, contentType: object.contentType, sha256: object.sha256 } : null;
    },
  };
}

function makeService(ownerId, provider) {
  return createPhotoCloudService({
    provider,
    getCurrentOwnerId: () => ownerId,
    isCatchMetadataSynced: async () => true,
    now: () => fixedNow,
  });
}

async function acknowledgeCatchOperations(ownerId) {
  const operations = await outboxRepository.list();
  let revision = 1;
  for (const operation of operations.filter((item) => item.ownerId === ownerId && item.entityType === "catch")) {
    await outboxRepository.acknowledge(operation.operationId, operation.localRevision, revision++);
  }
}

test("none provider stays local-only and never contacts cloud", async () => {
  await resetDatabase();
  const ownerId = "none-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const photo = makePhoto("p1", "original local bytes");
  await catchRepository.put(makeCatch(ownerId, "catch-none", [photo]), scope);
  const service = makeService(ownerId, nonePhotoCloudProvider);
  assert.equal((await service.run(ownerId)).status, "local-only");
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  assert.equal((await catchRepository.get("catch-none", scope)).photos[0].blob.size, photo.blob.size);
});

test("hidden app defers photo network work and keeps its durable job for foreground retry", async () => {
  await resetDatabase();
  const ownerId = "hidden-photo-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-hidden-photo", [makePhoto("p1", "hidden bytes")]), scope);
  const provider = createFakeProvider();
  let visible = true;
  let metadataSynced = false;
  const service = createPhotoCloudService({ provider, getCurrentOwnerId: () => ownerId,
    isCatchMetadataSynced: async () => metadataSynced, isVisible: () => visible, now: () => fixedNow });
  const deferredMetadata = await service.run(ownerId);
  assert.equal(deferredMetadata.status, "success");
  assert.equal(provider.calls.uploads.length, 0);
  const queued = await photoCloudOutboxRepository.list();
  assert.equal(queued.length, 1, "upload job is durable before any network request");
  assert.equal(queued[0].status, "pending");

  visible = false;
  const hiddenAttempt = await service.run(ownerId, { force: true });
  assert.equal(hiddenAttempt.status, "deferred");
  assert.equal(provider.calls.uploads.length, 0);
  assert.equal((await photoCloudOutboxRepository.list()).length, 1);

  await acknowledgeCatchOperations(ownerId);
  metadataSynced = true;
  visible = true;
  const foreground = await service.run(ownerId, { force: true });
  assert.equal(foreground.status, "success");
  assert.equal(provider.calls.uploads.length, 1);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
});

test("multiple photos upload independently; primary and crop edits do not upload bytes again", async () => {
  await resetDatabase();
  const ownerId = "multi-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const photos = [makePhoto("p1", "first bytes"), makePhoto("p2", "second bytes")];
  await catchRepository.put(makeCatch(ownerId, "catch-multi", photos), scope);
  const provider = createFakeProvider();
  const service = makeService(ownerId, provider);
  const result = await service.run(ownerId);
  assert.equal(result.status, "success");
  assert.equal(result.uploaded, 2);
  assert.equal(provider.objects.size, 2);
  const synced = await catchRepository.get("catch-multi", scope);
  assert.ok(synced.photos.every((photo) => photo.cloud.state === PHOTO_CLOUD_STATE.SYNCED));
  assert.equal(synced.photos[0].cloud.objectKey, createPhotoObjectKey(ownerId, "catch-multi", "p1"));
  assert.equal(synced.photos[0].cloud.sha256.length, 64);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);

  await catchRepository.put({
    ...synced,
    primaryPhotoId: "p2",
    photos: synced.photos.map((photo) => photo.id === "p1" ? { ...photo, focalX: 0.2, zoom: 1.4 } : photo),
    sync: { ...synced.sync, status: "local", revision: synced.sync.revision + 1 },
  }, scope);
  await service.run(ownerId);
  assert.equal(provider.calls.uploads.length, 2, "primary and crop metadata changes do not re-upload unchanged bytes");
});

test("legacy local Blob without a valid photo ID gets a stable ID before it is queued and uploaded", async () => {
  await resetDatabase();
  const ownerId = "legacy-photo-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-legacy-id", [{ ...makePhoto("", "legacy bytes"), id: "../bad id" }], null), scope);
  const provider = createFakeProvider();
  const service = makeService(ownerId, provider);
  await service.normalizeLegacyPhotoIds(ownerId);
  const normalized = await catchRepository.get("catch-legacy-id", scope);
  assert.match(normalized.photos[0].id, /^[A-Za-z0-9_-]{1,128}$/);
  assert.equal(normalized.primaryPhotoId, normalized.photos[0].id);
  assert.equal((await service.run(ownerId)).status, "success");
  assert.equal(provider.calls.uploads[0].photoId, normalized.photos[0].id);
  assert.equal((await catchRepository.get("catch-legacy-id", scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.SYNCED);
});

test("photo upload waits until Catch metadata and its photo reference are acknowledged", async () => {
  await resetDatabase();
  const ownerId = "metadata-order-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-order", [makePhoto("p1", "ordered bytes")]), scope);
  const provider = createFakeProvider();
  const service = createPhotoCloudService({ provider, getCurrentOwnerId: () => ownerId, now: () => fixedNow });
  assert.equal((await service.run(ownerId)).status, "success");
  assert.equal(provider.calls.uploads.length, 0, "unacknowledged Catch/photo metadata must not reach /sign");
  assert.equal((await photoCloudOutboxRepository.list()).length, 1, "the logical photo job remains queued");
  await acknowledgeCatchOperations(ownerId);
  assert.equal((await service.run(ownerId)).uploaded, 1);
  assert.equal(provider.calls.uploads.length, 1);
});

test("missing local bytes stay preserved and become terminal with a re-add state, not an infinite retry", async () => {
  await resetDatabase();
  const ownerId = "missing-photo-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const original = makePhoto("p1", "bytes no longer present");
  const sha256 = await (await import("./photoCloudProvider.js")).sha256Blob(original.blob);
  const catchRecord = makeCatch(ownerId, "catch-missing", [{ ...original, blob: undefined, cloud: original.cloud }]);
  await catchRepository.put(catchRecord, scope);
  await acknowledgeCatchOperations(ownerId);
  await photoCloudOutboxRepository.enqueue({ ownerId, catchId: catchRecord.id, photoId: "p1", operation: "upload",
    provider: "fake", objectKey: createPhotoObjectKey(ownerId, catchRecord.id, "p1"), sha256,
    size: original.size, contentType: original.type });
  const provider = createFakeProvider();
  const service = createPhotoCloudService({ provider, getCurrentOwnerId: () => ownerId, now: () => fixedNow });
  assert.equal((await service.run(ownerId)).status, "error");
  let [job] = await photoCloudOutboxRepository.list();
  assert.equal(job.status, "conflict");
  assert.equal(job.lastErrorCode, "photo_blob_missing");
  assert.equal(job.photoCloud.state, "failed_terminal");
  assert.equal((await catchRepository.get(catchRecord.id, scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.UNAVAILABLE);
  assert.equal((await service.run(ownerId, { force: true })).status, "success");
  [job] = await photoCloudOutboxRepository.list();
  assert.equal(job.status, "conflict", "force retry does not spin a job without local bytes");
  assert.equal(provider.calls.uploads.length, 0);
});

test("legacy HEIC Blob is converted to JPEG before it enters the Cloudinary upload queue", async () => {
  await resetDatabase();
  const ownerId = "legacy-heic-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const heic = new Blob(["legacy HEIC bytes"], { type: "image/heic" });
  await catchRepository.put(makeCatch(ownerId, "catch-legacy-heic", [{ id: "p1", name: "IMG_1.HEIC", type: heic.type, size: heic.size, blob: heic }]), scope);
  const provider = createFakeProvider();
  const service = createPhotoCloudService({ provider, getCurrentOwnerId: () => ownerId, isCatchMetadataSynced: async () => true, now: () => fixedNow,
    normalizeLegacyPhoto: async () => new Blob(["normalized JPEG bytes"], { type: "image/jpeg" }) });
  assert.equal((await service.run(ownerId)).status, "success");
  const saved = await catchRepository.get("catch-legacy-heic", scope);
  assert.equal(saved.photos[0].type, "image/jpeg");
  assert.equal(saved.photos[0].blob.type, "image/jpeg");
  assert.equal(saved.photos[0].cloud.state, PHOTO_CLOUD_STATE.SYNCED);
  assert.equal(provider.calls.uploads[0].contentType, "image/jpeg");
});

test("legacy image that cannot be decoded is retained locally and excluded from normal upload jobs", async () => {
  await resetDatabase();
  const ownerId = "unsupported-legacy-photo-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const original = new Blob(["unsupported original HEIC bytes"], { type: "image/heic" });
  await catchRepository.put(makeCatch(ownerId, "catch-unsupported-legacy", [
    { id: "p1", name: "legacy.HEIC", type: original.type, size: original.size, blob: original },
  ]), scope);
  const provider = createFakeProvider();
  const service = createPhotoCloudService({ provider, getCurrentOwnerId: () => ownerId,
    isCatchMetadataSynced: async () => true, now: () => fixedNow,
    normalizeLegacyPhoto: async (blob) => ({ blob: new Blob([await blob.arrayBuffer()], { type: "image/heic" }),
      type: "image/heic", size: blob.size, sha256: await (await import("./photoCloudProvider.js")).sha256Blob(blob),
      uploadReady: false, errorCode: "photo_unsupported" }) });
  assert.equal((await service.run(ownerId)).status, "success");
  const saved = await catchRepository.get("catch-unsupported-legacy", scope);
  assert.equal(saved.photos[0].uploadReady, false);
  assert.equal(saved.photos[0].cloud.state, PHOTO_CLOUD_STATE.UNAVAILABLE);
  assert.deepEqual(new Uint8Array(await saved.photos[0].blob.arrayBuffer()), new Uint8Array(await original.arrayBuffer()));
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  assert.equal(provider.calls.uploads.length, 0);
});

test("failed synced metadata persistence keeps upload job retryable", async () => {
  await resetDatabase();
  const ownerId = "metadata-write-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-metadata-write", [makePhoto("p1", "metadata write")]), scope);
  const provider = createFakeProvider();
  let failPhotoWrite = true;
  const catches = {
    list: (options) => catchRepository.list(options), get: (id, options) => catchRepository.get(id, options),
    put: (record, options) => catchRepository.put(record, options),
    setPhotoCloudState: (catchId, photoId, cloud, options) => catchRepository.setPhotoCloudState(catchId, photoId, cloud, options),
  };
  const originalPut = catches.put;
  catches.put = async (record, options) => {
    if (failPhotoWrite && record.photos?.some((photo) => photo.cloud?.state === PHOTO_CLOUD_STATE.SYNCED)) {
      failPhotoWrite = false;
      throw new Error("temporary local write failure");
    }
    return originalPut(record, options);
  };
  const service = createPhotoCloudService({ provider, catches, isCatchMetadataSynced: async () => true, getCurrentOwnerId: () => ownerId, now: () => fixedNow });
  assert.equal((await service.run(ownerId)).status, "error");
  assert.equal((await photoCloudOutboxRepository.list()).length, 1);
  assert.equal((await service.run(ownerId, { force: true })).status, "success");
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  assert.equal((await catchRepository.get("catch-metadata-write", scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.SYNCED);
  assert.equal(provider.objects.size, 1);
});

test("pending upload survives a service restart, retries, and uses the same object key after an ambiguous success", async () => {
  await resetDatabase();
  const ownerId = "retry-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-retry", [makePhoto("p1", "retry bytes")]), scope);
  const provider = createFakeProvider();
  provider.failures.upload = 1;
  const firstService = makeService(ownerId, provider);
  const failed = await firstService.run(ownerId);
  assert.equal(failed.status, "error");
  assert.equal((await photoCloudOutboxRepository.list()).length, 1);
  assert.equal((await catchRepository.get("catch-retry", scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.UPLOAD_FAILED);
  assert.equal(provider.objects.size, 0, "network failure leaves the original bytes and pending job local");

  const afterReload = makeService(ownerId, provider);
  const retried = await afterReload.run(ownerId, { force: true });
  assert.equal(retried.status, "success");
  assert.equal(provider.calls.uploads.length, 2);
  assert.equal(new Set(provider.calls.uploads.map((call) => call.objectKey)).size, 1);
  assert.equal(provider.objects.size, 1);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);

  const uploaded = await catchRepository.get("catch-retry", scope);
  provider.failures.uploadAfterWrite = 1;
  await catchRepository.put({
    ...uploaded,
    photos: uploaded.photos.map((photo) => ({ ...photo, blob: new Blob(["replacement bytes"], { type: "image/jpeg" }) })),
    sync: { ...uploaded.sync, status: "local", revision: uploaded.sync.revision + 1 },
  }, scope);
  assert.equal((await makeService(ownerId, provider).run(ownerId)).status, "error");
  assert.equal(provider.objects.size, 1, "same deterministic key is overwritten after an ambiguous response");
  assert.equal((await makeService(ownerId, provider).run(ownerId, { force: true })).status, "success");
  assert.equal(provider.objects.size, 1, "idempotent retry does not create another object");
  assert.equal(new Set(provider.calls.uploads.map((call) => call.objectKey)).size, 1);
});

test("forced retry requested during an in-flight photo sync runs after the current failure", async () => {
  await resetDatabase();
  const ownerId = "concurrent-force-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-concurrent-force", [makePhoto("p1", "force retry bytes")]), scope);
  const provider = createFakeProvider();
  let enterUpload;
  let releaseUpload;
  const entered = new Promise((resolve) => { enterUpload = resolve; });
  const blocked = new Promise((resolve) => { releaseUpload = resolve; });
  let first = true;
  let uploadAttempts = 0;
  const originalUpload = provider.upload.bind(provider);
  provider.upload = async (input) => {
    uploadAttempts += 1;
    if (first) {
      first = false;
      enterUpload();
      await blocked;
      throw new Error("transient first failure");
    }
    return originalUpload(input);
  };
  const service = makeService(ownerId, provider);
  const initial = service.run(ownerId);
  await entered;
  const forced = service.run(ownerId, { force: true });
  releaseUpload();
  const result = await forced;
  await initial;
  assert.equal(result.status, "success");
  assert.equal(uploadAttempts, 2);
  assert.equal(provider.calls.uploads.length, 1);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  assert.equal((await catchRepository.get("catch-concurrent-force", scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.SYNCED);
});

test("photo upload refreshes an invalid Firebase token once and completes with the refreshed token", async () => {
  await resetDatabase();
  const ownerId = "auth-refresh-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const photo = makePhoto("p-auth", "auth refresh bytes");
  await catchRepository.put(makeCatch(ownerId, "catch-auth-refresh", [photo]), scope);
  const tokenCalls = [];
  let refreshed = false;
  const getIdToken = async (forceRefresh) => {
    tokenCalls.push(forceRefresh);
    if (forceRefresh) refreshed = true;
    return refreshed ? "fresh-firebase-id-token" : "cached-firebase-id-token";
  };
  const authorizationHeaders = [];
  const requestEndpoint = createAuthenticatedPhotoEndpointCaller({
    getIdToken,
    fetchImpl: async (path, options) => {
      authorizationHeaders.push(options.headers.Authorization);
      if (path === "/api/cloudinary/sign" && options.headers.Authorization.endsWith("cached-firebase-id-token")) {
        return new Response(JSON.stringify({ error: "invalid_auth" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      if (path === "/api/cloudinary/sign") {
        const body = JSON.parse(options.body);
        const objectKey = createPhotoObjectKey(ownerId, body.catchId, body.photoId);
        return new Response(JSON.stringify({ cloudName: "test-cloud", apiKey: "1234567890", resourceType: "image",
          timestamp: 1_800_000_000, signature: "a".repeat(64), params: { public_id: `chytnucz/${objectKey}`, type: "authenticated", overwrite: true } }),
        { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (path === "/api/cloudinary/verify-upload") {
        return new Response(JSON.stringify({ verified: true, bytes: photo.blob.size, format: "jpg" }),
          { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected API endpoint: ${path}`);
    },
  });
  const provider = createCloudinaryPhotoProvider({ fetchImpl: async (url, options) => {
    if (String(url) === "/api/cloudinary/capability") {
      return new Response(JSON.stringify({ enabled: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    assert.match(String(url), /api\.cloudinary\.com\/v1_1\/test-cloud\/image\/upload$/);
    assert.equal(options.method, "POST");
    const form = options.body;
    return new Response(JSON.stringify({
      public_id: form.get("public_id"), resource_type: "image", type: "authenticated",
      bytes: photo.blob.size, format: "jpg",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  const service = createPhotoCloudService({ provider, isCatchMetadataSynced: async () => true, getCurrentOwnerId: () => ownerId, authenticatedRequest: requestEndpoint, now: () => fixedNow });
  const result = await service.run(ownerId);
  assert.equal(result.status, "success");
  assert.deepEqual(tokenCalls, [false, true, false]);
  assert.deepEqual(authorizationHeaders, ["Bearer cached-firebase-id-token", "Bearer fresh-firebase-id-token", "Bearer fresh-firebase-id-token"]);
  const saved = await catchRepository.get("catch-auth-refresh", scope);
  assert.equal(saved.photos[0].cloud.state, PHOTO_CLOUD_STATE.SYNCED);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
});

test("photo upload stops after exactly one forced refresh and retains a precise auth failure", async () => {
  await resetDatabase();
  const ownerId = "auth-repeat-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-auth-repeat", [makePhoto("p-auth", "auth fails twice")]), scope);
  const tokenCalls = [];
  let requests = 0;
  const requestEndpoint = createAuthenticatedPhotoEndpointCaller({
    getIdToken: async (forceRefresh) => { tokenCalls.push(forceRefresh); return forceRefresh ? "fresh-token" : "old-token"; },
    fetchImpl: async () => {
      requests += 1;
      return new Response(JSON.stringify({ error: "invalid_auth" }), { status: 401, headers: { "Content-Type": "application/json" } });
    },
  });
  const provider = createFakeProvider();
  const authenticatedProvider = { ...provider, async upload(input) { await input.requestUploadGrant({ catchId: input.catchId, photoId: input.photoId }); } };
  const service = createPhotoCloudService({ provider: authenticatedProvider, getCurrentOwnerId: () => ownerId, isCatchMetadataSynced: async () => true,
    authenticatedRequest: requestEndpoint, now: () => fixedNow });
  const result = await service.run(ownerId);
  assert.equal(result.status, "error");
  assert.equal(result.errorCode, "firebase_token_invalid");
  assert.equal(result.errorEndpoint, "/api/cloudinary/sign");
  assert.equal(requests, 2);
  assert.deepEqual(tokenCalls, [false, true]);
  const [job] = await photoCloudOutboxRepository.list();
  assert.equal(job.status, "failed");
  assert.equal(job.lastErrorCode, "firebase_token_invalid");
  assert.equal(job.lastEndpoint, "/api/cloudinary/sign");
  assert.equal((await catchRepository.get("catch-auth-repeat", scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.UPLOAD_FAILED);
});

test("download prefers local bytes, verifies remote bytes, caches per account, and rejects cross-account reads", async () => {
  await resetDatabase();
  const ownerId = "download-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const provider = createFakeProvider();
  const service = makeService(ownerId, provider);
  const blob = new Blob(["remote original"], { type: "image/jpeg" });
  const sha256 = await (await import("./photoCloudProvider.js")).sha256Blob(blob);
  const objectKey = createPhotoObjectKey(ownerId, "catch-download", "p1");
  provider.objects.set(objectKey, { blob, sha256, contentType: blob.type });
  const remotePhoto = { id: "p1", name: "p1.jpg", type: blob.type, size: blob.size,
    cloud: { state: PHOTO_CLOUD_STATE.SYNCED, provider: provider.id, objectKey, sha256 } };
  await catchRepository.put(makeCatch(ownerId, "catch-download", [remotePhoto]), scope);
  const loaded = await service.getPhotoBlob({ photo: remotePhoto, ownerId, catchId: "catch-download", scopeKey: scope.scopeKey });
  assert.equal(await loaded.text(), "remote original");
  assert.equal(provider.calls.downloads.length, 1);
  assert.equal((await catchRepository.get("catch-download", scope)).photos[0].blob.size, blob.size);
  assert.equal(await service.getPhotoBlob({ photo: { ...remotePhoto, blob: new Blob(["local"], { type: "image/jpeg" }) }, ownerId, catchId: "catch-download", scopeKey: scope.scopeKey }).then((cached) => cached.text()), "local");
  assert.equal(provider.calls.downloads.length, 1, "local cache avoids another network read");
  const missingPhoto = { ...remotePhoto, id: "missing", cloud: { ...remotePhoto.cloud, objectKey: createPhotoObjectKey(ownerId, "catch-download", "missing") } };
  await assert.rejects(() => service.getPhotoBlob({ photo: missingPhoto, ownerId, catchId: "catch-download", scopeKey: scope.scopeKey }), { code: "cloudinary_asset_missing" });

  const otherOwner = "other-account";
  const otherService = createPhotoCloudService({ provider, getCurrentOwnerId: () => otherOwner });
  assert.equal(await otherService.getPhotoBlob({ photo: remotePhoto, ownerId, catchId: "catch-download", scopeKey: accountScopeKey(ownerId) }), null);
  assert.equal(provider.calls.downloads.length, 2, "cross-account access is rejected before provider access");
  assert.equal(await otherService.getPhotoBlob({ photo: { ...remotePhoto, blob }, ownerId, catchId: "catch-download", scopeKey: accountScopeKey(ownerId) }), null,
    "cached local bytes are also rejected after an account switch");
  assert.equal(provider.calls.downloads.length, 2);
});

test("photo metadata moves between isolated devices; remote download caches and crop edit avoids reupload", async () => {
  const originalFactory = globalThis.indexedDB;
  const deviceA = new IDBFactory();
  const deviceB = new IDBFactory();
  const ownerId = "shared-account";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const provider = createFakeProvider("cloudinary-mock");
  const serviceA = makeService(ownerId, provider);
  const serviceB = makeService(ownerId, provider);
  try {
    globalThis.indexedDB = deviceA;
    const source = makeCatch(ownerId, "cross-device-photo", [makePhoto("p1", "shared photo bytes")]);
    await catchRepository.put(source, scope);
    assert.equal((await serviceA.run(ownerId)).status, "success");
    const syncedA = await catchRepository.get(source.id, scope);
    assert.equal(provider.calls.uploads.length, 1);

    // Represents the Firestore photo metadata pulled by the other device; Blob bytes are device-local.
    const remotePhoto = { ...syncedA.photos[0] };
    delete remotePhoto.blob;
    globalThis.indexedDB = deviceB;
    const pulledRecord = { ...syncedA, photos: [remotePhoto], sync: { status: "metadata-synced", revision: 0, serverRevision: 1 } };
    await catchRepository.put(pulledRecord, scope);
    const downloaded = await serviceB.getPhotoBlob({ photo: remotePhoto, ownerId, catchId: source.id, scopeKey: scope.scopeKey });
    assert.equal(await downloaded.text(), "shared photo bytes");
    assert.equal((await catchRepository.get(source.id, scope)).photos[0].blob.size, downloaded.size);
    assert.equal(provider.calls.downloads.length, 1);

    globalThis.indexedDB = deviceA;
    await catchRepository.put({
      ...syncedA,
      photos: syncedA.photos.map((photo) => ({ ...photo, focalX: 0.25, zoom: 1.3 })),
      sync: { ...syncedA.sync, status: "local", revision: syncedA.sync.revision + 1 },
    }, scope);
    await serviceA.run(ownerId);
    assert.equal(provider.calls.uploads.length, 1, "crop metadata change does not upload photo bytes again");
  } finally {
    globalThis.indexedDB = originalFactory;
  }
});

test("photo and Catch deletion are local-first with durable cloud delete retries", async () => {
  await resetDatabase();
  const ownerId = "delete-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const provider = createFakeProvider();
  const photos = [makePhoto("p1", "delete me"), makePhoto("p2", "delete with Catch")];
  await catchRepository.put(makeCatch(ownerId, "catch-delete", photos), scope);
  const service = makeService(ownerId, provider);
  await service.run(ownerId);
  const synced = await catchRepository.get("catch-delete", scope);
  const removedPhotoKey = synced.photos.find((photo) => photo.id === "p1").cloud.objectKey;
  provider.failures.delete = 1;
  await catchRepository.put({
    ...synced,
    photos: synced.photos.filter((photo) => photo.id !== "p1"),
    primaryPhotoId: "p2",
    sync: { ...synced.sync, status: "local", revision: synced.sync.revision + 1 },
  }, scope);
  assert.equal((await catchRepository.get("catch-delete", scope)).photos.length, 1, "photo disappears locally immediately");
  assert.equal((await photoCloudOutboxRepository.list())[0].photoCloud.state, PHOTO_CLOUD_STATE.PENDING_DELETE);
  assert.equal((await service.run(ownerId)).deleted, 0, "remote object deletion waits for Catch metadata acknowledgement");
  assert.equal(provider.objects.has(removedPhotoKey), true);
  await acknowledgeCatchOperations(ownerId);
  assert.equal((await service.run(ownerId)).status, "error");
  assert.equal(provider.objects.has(removedPhotoKey), true);
  assert.equal((await makeService(ownerId, provider).run(ownerId, { force: true })).status, "success");
  assert.equal(provider.objects.has(removedPhotoKey), false);

  const catchToDelete = await catchRepository.get("catch-delete", scope);
  const catchPhotoKey = catchToDelete.photos[0].cloud.objectKey;
  provider.failures.delete = 1;
  await catchRepository.delete("catch-delete", scope);
  assert.equal(await catchRepository.get("catch-delete", scope), undefined, "local Catch removal is immediate");
  assert.equal((await photoCloudOutboxRepository.list())[0].photoCloud.state, PHOTO_CLOUD_STATE.PENDING_DELETE);
  assert.equal((await service.run(ownerId)).deleted, 0, "Catch tombstone must reach Firestore before object deletion");
  await acknowledgeCatchOperations(ownerId);
  assert.equal((await service.run(ownerId)).status, "error");
  assert.equal(provider.objects.has(catchPhotoKey), true);
  assert.equal((await photoCloudOutboxRepository.list())[0].status, "failed");
  assert.equal((await photoCloudOutboxRepository.list())[0].photoCloud.state, "failed_retryable");
  const retryService = makeService(ownerId, provider);
  assert.equal((await retryService.run(ownerId, { force: true })).status, "success");
  assert.equal(provider.objects.has(catchPhotoKey), false);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
});

test("Gallery and Share prefer local primary photos and show a truthful fallback for remote-only data", () => {
  const record = { photos: [{ id: "p1", blob: new Blob(["local"]) }, { id: "p2" }], primaryPhotoId: "p2" };
  assert.equal(getPrimaryAvailablePhoto(record).id, "p1");
  assert.equal(getGalleryMissingMessage({ cloud: { state: PHOTO_CLOUD_STATE.SYNCED } }), "Tato fotografie má cloudová metadata, ale úložiště není dostupné.");
  assert.equal(getGalleryMissingMessage({ cloud: { state: PHOTO_CLOUD_STATE.LOCAL_ONLY } }), "Fotografie není na tomto zařízení dostupná.");
});
