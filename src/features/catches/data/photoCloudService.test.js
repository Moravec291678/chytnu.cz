import assert from "node:assert/strict";
import test from "node:test";
import { completedSyncState } from "../../sync/data/syncLifecycleState.js";
import { describeSyncFailure } from "../../sync/data/syncDiagnostics.js";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { catchRepository, outboxRepository, photoCloudOutboxRepository } from "./catchRepository.js";
import { getGalleryMissingMessage } from "./catchGallery.js";
import { getPrimaryAvailablePhoto } from "./catchPhotos.js";
import { createPhotoCloudService, createAuthenticatedPhotoEndpointCaller, inspectPhotoDelivery } from "./photoCloudService.js";
import { createCloudinaryPhotoProvider } from "./cloudinaryPhotoProvider.js";
import { createPhotoObjectKey, nonePhotoCloudProvider, PHOTO_CLOUD_STATE } from "./photoCloudProvider.js";
import { readSyncSummary } from "../../sync/data/localSyncRepository.js";

const databaseName = "chytnu-local";
const fixedNow = Date.parse("2026-10-21T12:00:00.000Z");

test("photo delivery diagnostics report metadata and provider HTTP statuses without returning photo bytes", async () => {
  const calls = [];
  const result = await inspectPhotoDelivery({ catchId: "catch-a", photoId: "photo-a", now: () => fixedNow,
    authenticatedRequest: async (path, payload, options) => {
      calls.push({ path, payload, options });
      if (path.endsWith("/metadata")) return { bytes: 12345, format: "jpg", width: 10, height: 10 };
      throw Object.assign(new Error("hidden"), { status: 502, providerStatus: 404, code: "cloudinary_asset_missing" });
    } });
  assert.deepEqual(calls.map((call) => call.path), ["/api/cloudinary/metadata", "/api/cloudinary/export"]);
  assert.deepEqual(result, { timestamp: new Date(fixedNow).toISOString(), metadataStatus: 200, deliveryStatus: 502,
    providerStatus: 404, errorCode: "cloudinary_asset_missing" });
  assert.equal("bytes" in result, false);
});

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

test("authenticated photo download returns the same-origin verified binary body", async () => {
  const blob = new Blob(["remote bytes"], { type: "image/jpeg" });
  let request;
  const call = createAuthenticatedPhotoEndpointCaller({
    getIdToken: async () => "firebase-token",
    fetchImpl: async (path, options) => {
      request = { path, options };
      return new Response(blob, { status: 200, headers: { "Content-Type": "image/jpeg" } });
    },
  });
  const result = await call("/api/cloudinary/export", { catchId: "catch-a", photoId: "photo-a" }, { responseType: "blob" });
  assert.equal(await result.text(), "remote bytes");
  assert.equal(request.path, "/api/cloudinary/export");
  assert.equal(request.options.headers.Authorization, "Bearer firebase-token");
  assert.deepEqual(JSON.parse(request.options.body), { catchId: "catch-a", photoId: "photo-a" });
});

test("verified photo delivery preserves Cloudinary status and maps a real 404 to the missing-photo state", async () => {
  const call = createAuthenticatedPhotoEndpointCaller({
    getIdToken: async () => "firebase-token",
    fetchImpl: async () => new Response(JSON.stringify({ error: "photo_not_available", providerStatus: 404 }), { status: 404 }),
  });
  await assert.rejects(call("/api/cloudinary/export", { catchId: "catch-a", photoId: "photo-a" }, { responseType: "blob" }),
    (error) => error.code === "cloudinary_asset_missing" && error.status === 404 && error.providerStatus === 404);
});

test("photo metadata 404 is not mislabeled as a missing Cloudinary asset", async () => {
  const call = createAuthenticatedPhotoEndpointCaller({
    getIdToken: async () => "firebase-token",
    fetchImpl: async () => new Response(JSON.stringify({ error: "photo_not_available" }), { status: 404 }),
  });
  await assert.rejects(call("/api/cloudinary/export", { catchId: "catch-a", photoId: "photo-a" }, { responseType: "blob" }),
    (error) => error.code === "photo_metadata_not_ready" && error.status === 404 && error.providerStatus === undefined);
});

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
  const calls = { uploads: [], downloads: [], deletes: [], stages: [], recoveries: [] };
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
    async recoverUpload(input) {
      calls.recoveries.push(input);
      const object = objects.get(input.objectKey);
      return Boolean(object && object.sha256 === input.sha256 && object.blob.size === input.size && object.contentType === input.contentType);
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

test("one Catch with four photos ends with zero logical pending operations", async () => {
  await resetDatabase();
  const ownerId = "four-photo-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-four", [1, 2, 3, 4].map((number) => makePhoto(`p${number}`))), scope);
  const provider = createFakeProvider();
  let activeUploads = 0;
  let maxConcurrentUploads = 0;
  const upload = provider.upload.bind(provider);
  provider.upload = async (input) => {
    activeUploads += 1;
    maxConcurrentUploads = Math.max(maxConcurrentUploads, activeUploads);
    await new Promise((resolve) => setTimeout(resolve, 10));
    try { return await upload(input); } finally { activeUploads -= 1; }
  };
  const published = [];
  const service = createPhotoCloudService({ provider, getCurrentOwnerId: () => ownerId,
    isCatchMetadataSynced: async () => true, now: () => fixedNow,
    onPhotoReady: async ({ photoId }) => {
      const record = await catchRepository.get("catch-four", scope);
      assert.equal(record.photos.find((photo) => photo.id === photoId).cloud.state, PHOTO_CLOUD_STATE.SYNCED);
      published.push(photoId);
    } });
  assert.equal((await service.run(ownerId)).uploaded, 4);
  assert.deepEqual(published.sort(), ["p1", "p2", "p3", "p4"], "each READY photo is published independently");
  assert.equal(maxConcurrentUploads, 2, "the worker caps concurrent photo uploads at two");
  assert.equal((await catchRepository.get("catch-four", scope)).photos.filter((photo) => photo.cloud.state === PHOTO_CLOUD_STATE.SYNCED).length, 4,
    "parallel finalization preserves every photo metadata write on the same Catch");
  assert.equal((await readSyncSummary(ownerId)).pending, 1, "Catch metadata is one logical pending item");
  await acknowledgeCatchOperations(ownerId);
  assert.equal((await readSyncSummary(ownerId)).pending, 0);
  assert.equal((await readSyncSummary(ownerId)).lastError, "");
});

test("a concurrent transient failure cannot overwrite another photo's ready metadata", async () => {
  await resetDatabase();
  const ownerId = "parallel-failure-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-parallel", [makePhoto("p1"), makePhoto("p2")]), scope);
  const provider = createFakeProvider();
  provider.failures.upload = 1;
  const upload = provider.upload.bind(provider);
  provider.upload = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return upload(input);
  };
  const result = await makeService(ownerId, provider).run(ownerId);
  assert.equal(result.status, "error");
  const saved = await catchRepository.get("catch-parallel", scope);
  assert.equal(saved.photos.filter((photo) => photo.cloud.state === PHOTO_CLOUD_STATE.SYNCED).length, 1);
  assert.equal(saved.photos.filter((photo) => photo.cloud.state === PHOTO_CLOUD_STATE.UPLOAD_FAILED).length, 1);
  assert.equal((await photoCloudOutboxRepository.list()).filter((operation) => operation.status === "failed").length, 1);
});

test("stale photo upload operation with cloud-ready metadata is removed without uploading", async () => {
  await resetDatabase();
  const ownerId = "ready-photo-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-ready", [makePhoto("p1")]), scope);
  const provider = createFakeProvider();
  await makeService(ownerId, provider).run(ownerId);
  const photo = (await catchRepository.get("catch-ready", scope)).photos[0];
  await photoCloudOutboxRepository.enqueue({ ownerId, catchId: "catch-ready", photoId: "p1", operation: "upload",
    provider: provider.id, objectKey: photo.cloud.objectKey, sha256: photo.cloud.sha256, size: photo.size, contentType: photo.type });
  assert.equal((await photoCloudOutboxRepository.list()).length, 1);
  const [stale] = await photoCloudOutboxRepository.list();
  await outboxRepository.markConflict(stale.operationId, "stale missing blob", "photo_blob_missing");
  await makeService(ownerId, provider).run(ownerId);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  assert.equal(provider.calls.uploads.length, 1);
});

test("app restart after Cloudinary accepted an upload but before local completion verifies and finishes it", async () => {
  await resetDatabase();
  const ownerId = "interrupted-photo-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const photo = makePhoto("p1", "uploaded before iPhone backgrounding");
  await catchRepository.put(makeCatch(ownerId, "catch-interrupted", [photo]), scope);
  const provider = createFakeProvider();
  await createPhotoCloudService({ provider, getCurrentOwnerId: () => ownerId, isCatchMetadataSynced: async () => false,
    now: () => fixedNow }).run(ownerId);
  const job = (await photoCloudOutboxRepository.list())[0];
  provider.objects.set(job.photoCloud.objectKey, { blob: photo.blob, sha256: job.photoCloud.sha256, contentType: photo.type });
  await photoCloudOutboxRepository.setStage(job.operationId, job.localRevision, "uploading");
  assert.equal((await readSyncSummary(ownerId)).pending, 1);
  const resumed = await makeService(ownerId, provider).run(ownerId);
  assert.equal(resumed.uploaded, 1);
  assert.equal(provider.calls.uploads.length, 0, "confirmed existing asset must not be sent twice");
  assert.equal((await catchRepository.get("catch-interrupted", scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.SYNCED);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  await acknowledgeCatchOperations(ownerId);
  assert.equal((await readSyncSummary(ownerId)).pending, 0);
});

test("NotFoundError in one IndexedDB photo Blob is isolated while readable photos still upload", async () => {
  await resetDatabase();
  const ownerId = "broken-local-blob-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  await catchRepository.put(makeCatch(ownerId, "catch-a-b-c", [makePhoto("p-a"), makePhoto("p-b"), makePhoto("p-c")]), scope);
  let brokenReads = 0;
  const broken = new (class extends Blob {
    async arrayBuffer() { brokenReads += 1; throw new DOMException("The object can not be found here.", "NotFoundError"); }
  })(["bytes still report as present"], { type: "image/jpeg" });
  const catches = {
    ...catchRepository,
    async list(requestedScope) {
      const records = await catchRepository.list(requestedScope);
      return records.map((record) => ({ ...record, photos: record.photos.map((photo) => photo.id === "p-b" ? { ...photo, blob: broken } : photo) }));
    },
  };
  const provider = createFakeProvider();
  const service = createPhotoCloudService({ provider, catches, getCurrentOwnerId: () => ownerId,
    isCatchMetadataSynced: async () => true, now: () => fixedNow });
  const first = await service.run(ownerId);
  assert.equal(first.status, "partial");
  assert.equal(first.errorCode, "photo_local_blob_unreadable", "reconcile-only failure is surfaced as partial attention, not global fatal error");
  assert.equal(first.needsAttention, true);
  assert.equal(first.uploaded, 2);
  assert.deepEqual(provider.calls.uploads.map((call) => call.photoId), ["p-a", "p-c"]);
  const saved = await catchRepository.get("catch-a-b-c", scope);
  assert.equal(saved.photos[1].localError.code, "photo_local_blob_unreadable");
  assert.equal(saved.photos[1].localError.errorName, "NotFoundError");
  assert.equal(saved.photos[1].localError.stage, "photo-hash-local-blob");
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  const automatic = await service.run(ownerId);
  assert.equal(automatic.uploaded, 0);
  assert.equal(brokenReads, 1, "ordinary reconcile does not retry an unreadable Blob repeatedly");
  await service.run(ownerId, { force: true });
  assert.equal(brokenReads, 2, "manual Retry can make one explicit new attempt");
});

test("a synced Cloudinary copy repairs an unreadable local Blob", async () => {
  await resetDatabase();
  const ownerId = "cloud-photo-recovery-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const photo = makePhoto("p-cloud", "recover from cloud");
  const sha256 = await (await import("./photoCloudProvider.js")).sha256Blob(photo.blob);
  const key = createPhotoObjectKey(ownerId, "catch-cloud-recovery", photo.id);
  photo.cloud = { state: PHOTO_CLOUD_STATE.SYNCED, provider: "fake", objectKey: key, sha256 };
  await catchRepository.put(makeCatch(ownerId, "catch-cloud-recovery", [photo]), scope);
  const provider = createFakeProvider();
  provider.objects.set(key, { blob: photo.blob, sha256, contentType: photo.type });
  const service = createPhotoCloudService({ provider, getCurrentOwnerId: () => ownerId, now: () => fixedNow });
  const broken = new (class extends Blob { async arrayBuffer() { throw new DOMException("The object can not be found here.", "NotFoundError"); } })(
    ["broken backing"], { type: "image/jpeg" });
  const recovered = await service.getPhotoBlob({ photo: { ...photo, blob: broken }, ownerId,
    catchId: "catch-cloud-recovery", scopeKey: scope.scopeKey });
  assert.equal(await recovered.text(), "recover from cloud");
  assert.equal(provider.calls.downloads.length, 1);
  const stored = await catchRepository.get("catch-cloud-recovery", scope);
  assert.equal(await stored.photos[0].blob.text(), "recover from cloud");
  assert.equal(stored.photos[0].localError, undefined);
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
  const blockedSummary = await readSyncSummary(ownerId);
  assert.equal(blockedSummary.photoConflicts, 1);
  assert.equal(blockedSummary.lastErrorCode, "photo_blob_missing");
  assert.equal(completedSyncState({ result: { status: "success" }, summary: blockedSummary }), "user-action-required");
  assert.equal(job.photoCloud.state, "failed_terminal");
  assert.equal((await catchRepository.get(catchRecord.id, scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.UNAVAILABLE);
  assert.equal((await service.run(ownerId, { force: true })).status, "error");
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

test("legacy preparation failure is durable, preserves bytes, allows healthy uploads and recovers on forced retry", async () => {
  await resetDatabase();
  const ownerId = "unsupported-legacy-photo-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const original = new Blob(["unsupported original HEIC bytes"], { type: "image/heic" });
  await catchRepository.put(makeCatch(ownerId, "catch-unsupported-legacy", [
    { id: "p1", name: "legacy.HEIC", type: original.type, size: original.size, blob: original, uploadReady: false },
    makePhoto("p2", "healthy JPEG"),
  ]), scope);
  const provider = createFakeProvider();
  let conversions = 0;
  let canDecode = false;
  const createService = () => createPhotoCloudService({ provider, getCurrentOwnerId: () => ownerId,
    isCatchMetadataSynced: async () => true, now: () => fixedNow,
    normalizeLegacyPhoto: async () => {
      conversions += 1;
      if (!canDecode) throw new Error("Decoder unavailable");
      return new Blob(["normalized JPEG"], { type: "image/jpeg" });
    } });
  const first = await createService().run(ownerId);
  assert.equal(first.status, "error");
  assert.equal(first.uploaded, 1, "a bad legacy photo must not block a healthy photo");
  assert.equal(first.errorCode, "photo_prepare_failed");
  let saved = await catchRepository.get("catch-unsupported-legacy", scope);
  assert.equal(saved.photos[0].uploadReady, false);
  assert.equal(saved.photos[0].cloud.state, PHOTO_CLOUD_STATE.UPLOAD_FAILED);
  assert.deepEqual(await saved.photos[0].blob.arrayBuffer(), await original.arrayBuffer());
  const [job] = await photoCloudOutboxRepository.list();
  assert.equal(job.status, "failed");
  assert.equal(job.lastErrorCode, "photo_prepare_failed");
  assert.equal((await createService().run(ownerId)).uploaded, 0);
  assert.equal(conversions, 0, "ordinary resume does not repeatedly decode known unsupported bytes");
  assert.equal((await createService().run(ownerId, { force: true })).status, "error");
  assert.equal(conversions, 1);
  assert.deepEqual((await catchRepository.get("catch-unsupported-legacy", scope)).photos[0].blob.size, original.size);
  canDecode = true;
  assert.equal((await createService().run(ownerId, { force: true })).uploaded, 1);
  assert.equal(conversions, 2);
  saved = await catchRepository.get("catch-unsupported-legacy", scope);
  assert.equal(saved.photos[0].uploadReady, true);
  assert.equal(saved.photos[0].cloud.state, PHOTO_CLOUD_STATE.SYNCED);
  assert.equal(saved.photos[0].blob.type, "image/jpeg");
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  assert.equal((await createService().run(ownerId)).uploaded, 0);
  assert.equal(conversions, 2);
});

test("iPhone-like File restored from IndexedDB preserves its bytes through upload", async () => {
  await resetDatabase();
  const ownerId = "restored-file-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const file = new File([new Uint8Array([255, 216, 255, 224, 1, 2, 3, 255, 217])], "IMG_1234.JPG", { type: "image/jpeg" });
  await catchRepository.put(makeCatch(ownerId, "catch-file", [{ ...makePhoto("p-file"), blob: file, size: file.size, name: file.name }]), scope);
  const restored = (await catchRepository.get("catch-file", scope)).photos[0].blob;
  assert.notEqual(restored, file);
  assert.equal(restored.type, file.type);
  assert.deepEqual(await restored.arrayBuffer(), await file.arrayBuffer());
  const provider = createFakeProvider();
  assert.equal((await makeService(ownerId, provider).run(ownerId)).uploaded, 1);
  assert.deepEqual(await provider.calls.uploads[0].blob.arrayBuffer(), await file.arrayBuffer());
});

test("upload success and interrupted local completion recover after reload without duplicate upload", async () => {
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
  assert.equal((await makeService(ownerId, provider).run(ownerId, { force: true })).status, "success");
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  assert.equal((await catchRepository.get("catch-metadata-write", scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.SYNCED);
  assert.equal(provider.objects.size, 1);
  assert.equal(provider.calls.uploads.length, 1, "recovery verifies the cloud asset rather than uploading again");
  assert.equal(provider.calls.recoveries.length, 1);
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
  assert.notEqual((await readSyncSummary(ownerId)).lastError, "");
  assert.equal((await catchRepository.get("catch-retry", scope)).photos[0].cloud.state, PHOTO_CLOUD_STATE.UPLOAD_FAILED);
  assert.equal(provider.objects.size, 0, "network failure leaves the original bytes and pending job local");

  const afterReload = makeService(ownerId, provider);
  const retried = await afterReload.run(ownerId, { force: true });
  assert.equal(retried.status, "success");
  assert.equal(provider.calls.uploads.length, 2);
  assert.equal(new Set(provider.calls.uploads.map((call) => call.objectKey)).size, 1);
  assert.equal(provider.objects.size, 1);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  assert.equal((await readSyncSummary(ownerId)).lastError, "", "successful retry removes the stale error");
  assert.equal((await readSyncSummary(ownerId)).failed, 0);

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
  assert.equal(provider.calls.uploads.length, 3, "ambiguous successful replacement is verified without a second upload");
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

test("download repairs a mismatched local cache, verifies remote bytes, and rejects cross-account reads", async () => {
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
  assert.equal(await service.getPhotoBlob({ photo: { ...remotePhoto, blob: new Blob(["local"], { type: "image/jpeg" }) }, ownerId, catchId: "catch-download", scopeKey: scope.scopeKey }).then((cached) => cached.text()), "remote original");
  assert.equal(provider.calls.downloads.length, 2, "a local SHA mismatch recovers from the verified cloud copy");
  const missingPhoto = { ...remotePhoto, id: "missing", cloud: { ...remotePhoto.cloud, objectKey: createPhotoObjectKey(ownerId, "catch-download", "missing") } };
  await assert.rejects(() => service.getPhotoBlob({ photo: missingPhoto, ownerId, catchId: "catch-download", scopeKey: scope.scopeKey }), { code: "cloudinary_asset_missing" });

  const otherOwner = "other-account";
  const otherService = createPhotoCloudService({ provider, getCurrentOwnerId: () => otherOwner });
  assert.equal(await otherService.getPhotoBlob({ photo: remotePhoto, ownerId, catchId: "catch-download", scopeKey: accountScopeKey(ownerId) }), null);
  assert.equal(provider.calls.downloads.length, 3, "cross-account access is rejected before provider access");
  assert.equal(await otherService.getPhotoBlob({ photo: { ...remotePhoto, blob }, ownerId, catchId: "catch-download", scopeKey: accountScopeKey(ownerId) }), null,
    "cached local bytes are also rejected after an account switch");
  assert.equal(provider.calls.downloads.length, 3);
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

test("upload completing during Catch deletion cannot restore the removed photo", async () => {
  await resetDatabase();
  const ownerId = "upload-delete-race";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const provider = createFakeProvider();
  let releaseUpload;
  let notifyUploaded;
  const uploadWritten = new Promise((resolve) => { notifyUploaded = resolve; });
  const finishUpload = new Promise((resolve) => { releaseUpload = resolve; });
  provider.upload = async (input) => {
    await input.onStage("signing");
    await input.onStage("uploading");
    provider.objects.set(input.objectKey, { blob: input.blob, sha256: input.sha256, contentType: input.contentType });
    notifyUploaded();
    await finishUpload;
    return { objectKey: input.objectKey };
  };
  await catchRepository.put(makeCatch(ownerId, "race-catch", [makePhoto("race-photo")]), scope);
  const running = makeService(ownerId, provider).run(ownerId);
  await uploadWritten;
  await catchRepository.delete("race-catch", scope);
  releaseUpload();
  await running;
  assert.equal(await catchRepository.get("race-catch", scope), undefined);
  const jobs = await photoCloudOutboxRepository.list();
  assert.deepEqual(jobs.map((job) => job.operation), ["photo-delete"]);
  assert.equal(provider.objects.size, 1, "the already-started upload is retained for queued cleanup");
  await acknowledgeCatchOperations(ownerId);
  assert.equal((await makeService(ownerId, provider).run(ownerId)).deleted, 1);
  assert.equal(provider.objects.size, 0);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
});

test("Gallery and Share prefer local primary photos and show a truthful fallback for remote-only data", () => {
  const record = { photos: [{ id: "p1", blob: new Blob(["local"]) }, { id: "p2" }], primaryPhotoId: "p2" };
  assert.equal(getPrimaryAvailablePhoto(record).id, "p1");
  assert.match(getGalleryMissingMessage({ cloud: { state: PHOTO_CLOUD_STATE.SYNCED } }), /synchronizace trvat déle/);
  assert.match(getGalleryMissingMessage({ cloud: { state: PHOTO_CLOUD_STATE.LOCAL_ONLY } }), /synchronizace trvat déle/);
});


test("native file cleanup waits for Firestore acknowledgement of verified photo metadata", async () => {
  await resetDatabase();
  const ownerId = "native-finalize-owner";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const catchId = "native-finalize-catch";
  await catchRepository.put(makeCatch(ownerId, catchId, [makePhoto("p1", "native durable bytes")]), scope);
  const provider = createFakeProvider();
  const acknowledged = [];
  provider.listPendingUploads = async () => {
    const record = await catchRepository.get(catchId, scope);
    return [{ operationId: "native-op", ownerId, catchId, photoId: "p1", sha256: record.photos[0].cloud.sha256 }];
  };
  provider.acknowledgeUpload = async ({ operationId }) => acknowledged.push(operationId);
  const service = makeService(ownerId, provider);
  await service.run(ownerId);
  await service.finalizeNativeUploads(ownerId);
  assert.deepEqual(acknowledged, [], "local READY alone must retain native file");
  await acknowledgeCatchOperations(ownerId);
  await service.finalizeNativeUploads(ownerId);
  assert.deepEqual(acknowledged, ["native-op"]);
});


test("manual sync recovers terminal unreadable photo from cloud, clears attention, errors and pending", async () => {
  await resetDatabase();
  const ownerId = "manual-recovery";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const original = makePhoto("p1", "durable original");
  const { sha256Blob } = await import("./photoCloudProvider.js");
  const sha256 = await sha256Blob(original.blob);
  const catchId = "manual-catch";
  const objectKey = createPhotoObjectKey(ownerId, catchId, original.id);
  await catchRepository.put(makeCatch(ownerId, catchId, [original]), scope);
  await photoCloudOutboxRepository.enqueue({ ownerId, catchId, photoId: original.id, operation: "upload",
    provider: "fake", objectKey, sha256, size: original.size, contentType: original.type });
  const [job] = await photoCloudOutboxRepository.list();
  await outboxRepository.markConflict(job.operationId, "unreadable", "photo_local_blob_unreadable");
  const broken = new (class extends Blob {
    async arrayBuffer() { throw new DOMException("missing", "NotFoundError"); }
  })(["durable original"], { type: original.type });
  const breakPhoto = (record) => record && ({ ...record, photos: record.photos.map((photo) => ({ ...photo, blob: broken })) });
  const catches = { ...catchRepository,
    async list(scope) { return (await catchRepository.list(scope)).map(breakPhoto); },
    async get(id, scope) { return breakPhoto(await catchRepository.get(id, scope)); },
  };
  const provider = createFakeProvider();
  provider.objects.set(objectKey, { blob: original.blob, sha256, contentType: original.type });
  const service = createPhotoCloudService({ provider, catches, getCurrentOwnerId: () => ownerId,
    isCatchMetadataSynced: async () => true, now: () => fixedNow });
  const recover = provider.recoverUpload.bind(provider);
  provider.recoverUpload = async () => { throw Object.assign(new Error("temporary network"), { code: "photo_cloud_network_error" }); };
  const temporary = await service.run(ownerId, { force: true });
  assert.equal(temporary.needsAttention, false);
  assert.equal(completedSyncState({ result: { status: "success" }, photoResult: temporary,
    summary: await readSyncSummary(ownerId) }), "retry-wait");
  provider.recoverUpload = recover;
  const photoResult = await service.run(ownerId, { force: true });
  assert.equal(photoResult.needsAttention, false);
  assert.equal(provider.calls.uploads.length, 0);
  assert.equal(provider.calls.recoveries.length, 1);
  await acknowledgeCatchOperations(ownerId);
  const summary = await readSyncSummary(ownerId);
  assert.equal(summary.pending, 0);
  assert.equal(summary.lastError, "");
  assert.equal(summary.nextRetryAt, null);
  assert.equal((await photoCloudOutboxRepository.list()).length, 0);
  assert.equal(completedSyncState({ result: { status: "success" }, photoResult, summary }), "synced");
});

test("token acquisition network failure retries; revoked session still requires action", async () => {
  for (const [code, retryable] of [["auth/network-request-failed", true], ["auth/user-disabled", false]]) {
    const request = createAuthenticatedPhotoEndpointCaller({ getIdToken: async () => { throw { code }; } });
    await assert.rejects(request("/api/cloudinary/sign", {}), (error) => {
      assert.equal(describeSyncFailure(error).retryable, retryable);
      return true;
    });
  }
});
