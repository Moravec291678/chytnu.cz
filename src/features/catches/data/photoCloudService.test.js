import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { catchRepository, outboxRepository, photoCloudOutboxRepository } from "./catchRepository.js";
import { getGalleryMissingMessage } from "./catchGallery.js";
import { getPrimaryAvailablePhoto } from "./catchPhotos.js";
import { createPhotoCloudService } from "./photoCloudService.js";
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
  const calls = { uploads: [], downloads: [], deletes: [] };
  const failures = { upload: 0, uploadAfterWrite: 0, download: 0, delete: 0 };
  return {
    id, objects, calls, failures, available: true,
    async isAvailable() { return this.available; },
    async upload(input) {
      calls.uploads.push(input);
      if (failures.upload > 0) { failures.upload -= 1; throw new Error("network upload failed"); }
      objects.set(input.objectKey, { blob: input.blob, sha256: input.sha256, contentType: input.contentType });
      if (failures.uploadAfterWrite > 0) { failures.uploadAfterWrite -= 1; throw new Error("upload response lost"); }
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
  assert.equal(await service.getPhotoBlob({ photo: missingPhoto, ownerId, catchId: "catch-download", scopeKey: scope.scopeKey }), null);

  const otherOwner = "other-account";
  const otherService = createPhotoCloudService({ provider, getCurrentOwnerId: () => otherOwner });
  assert.equal(await otherService.getPhotoBlob({ photo: remotePhoto, ownerId, catchId: "catch-download", scopeKey: accountScopeKey(ownerId) }), null);
  assert.equal(provider.calls.downloads.length, 2, "cross-account access is rejected before provider access");
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
