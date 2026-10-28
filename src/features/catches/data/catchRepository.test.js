import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { openLocalDatabase, getActiveGuestScopeKey, catchRepository, outboxRepository, photoCloudOutboxRepository, PHOTO_BINARY_STORE_NAME, CATCH_STORE_NAME, NOTIFICATION_STORE_NAME, SERVER_PROGRESSION_CLAIM_STORE_NAME } from "./catchRepository.js";
import { sha256Blob } from "./photoCloudProvider.js";
import { tripRepository } from "../../trips/data/tripRepository.js";

const DATABASE_NAME = "chytnu-local";
const now = "2026-10-17T09:00:00.000Z";

async function guestScope() {
  return { scopeKey: await getActiveGuestScopeKey(), ownerId: null };
}

function makeCatch(id, overrides = {}) {
  return {
    schemaVersion: 1, id, createdAt: now, updatedAt: now, caughtAt: now,
    species: "Kapr", speciesKey: "carp", weightKg: null, lengthCm: null,
    tripId: null, photos: [], notes: "", sync: { status: "local", revision: 1 },
    ...overrides,
  };
}

function makeTrip(id, overrides = {}) {
  return {
    schemaVersion: 1, id, title: "Ranní výprava", createdAt: now,
    updatedAt: now, startedAt: now, endedAt: null,
    sync: { status: "local", revision: 1 }, ...overrides,
  };
}

async function deleteDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Databáze zůstala otevřená."));
  });
}

async function seedVersionTwo({ catches = [], trips = [] } = {}) {
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("catches", { keyPath: "id" });
      db.createObjectStore("trips", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["catches", "trips"], "readwrite");
      catches.forEach((record) => transaction.objectStore("catches").put(record));
      trips.forEach((record) => transaction.objectStore("trips").put(record));
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

test("v2 to v4 upgrade preserves existing catches, trips, photos, and starts with empty sync metadata", async () => {
  await deleteDatabase();
  const photoBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  const oldCatch = makeCatch("old-catch", { tripId: "old-trip", photos: [{ id: "photo-1", blob: photoBlob, type: "image/jpeg" }] });
  const oldTrip = makeTrip("old-trip", { endedAt: "2026-10-17T12:00:00.000Z" });
  await seedVersionTwo({ catches: [oldCatch], trips: [oldTrip] });
  const scope = await guestScope();

  const catches = await catchRepository.list(scope);
  const trips = await tripRepository.list(scope);
  const db = await openLocalDatabase();
  assert.equal(db.version, 9);
  assert.deepEqual([...db.objectStoreNames].sort(), ["appMeta", "catches", "localProfiles", "notifications", "outbox", "photoBinaries", "privacySettings", "progressionEvents", "serverProgressionClaims", "syncConflicts", "syncState", "trips", "waterChat", "waters"]);
  assert.ok(db.transaction(NOTIFICATION_STORE_NAME).objectStore(NOTIFICATION_STORE_NAME).indexNames.contains("scopeKey"));
  assert.ok(db.transaction(SERVER_PROGRESSION_CLAIM_STORE_NAME).objectStore(SERVER_PROGRESSION_CLAIM_STORE_NAME).indexNames.contains("ownerId"));
  db.close();
  assert.equal(catches[0].id, "old-catch");
  assert.equal(catches[0].tripId, "old-trip");
  assert.equal(catches[0].photos[0].blob.size, 3);
  assert.equal(trips[0].id, "old-trip");
  assert.deepEqual(await outboxRepository.list(), []);
});

test("photo bytes persist separately as ArrayBuffer and metadata writes leave the binary payload untouched", async () => {
  await deleteDatabase();
  const scope = await guestScope();
  const photo = new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])], { type: "image/jpeg" });
  const hash = await sha256Blob(photo);
  await catchRepository.put(makeCatch("binary-photo-catch", { photos: [{ id: "binary-photo", type: photo.type,
    size: photo.size, contentSha256: hash, blob: photo }] }), scope);
  const db = await openLocalDatabase();
  const transaction = db.transaction([CATCH_STORE_NAME, PHOTO_BINARY_STORE_NAME], "readonly");
  const storedCatch = await new Promise((resolve, reject) => {
    const request = transaction.objectStore(CATCH_STORE_NAME).get("binary-photo-catch");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const binary = await new Promise((resolve, reject) => {
    const request = transaction.objectStore(PHOTO_BINARY_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result[0]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  assert.equal(storedCatch.photos[0].blob, undefined);
  assert.ok(binary.bytes instanceof ArrayBuffer);
  assert.equal(binary.size, photo.size);
  assert.equal(await sha256Blob(new Blob([binary.bytes], { type: binary.type })), hash);

  await catchRepository.setPhotoCloudState("binary-photo-catch", "binary-photo", {
    state: "synced", provider: "cloudinary", objectKey: "users/u/catches/c/photos/p/original", sha256: hash,
  }, scope);
  const hydrated = await catchRepository.get("binary-photo-catch", scope);
  assert.equal(await sha256Blob(hydrated.photos[0].blob), hash);
  const afterDb = await openLocalDatabase();
  const after = afterDb.transaction([CATCH_STORE_NAME, PHOTO_BINARY_STORE_NAME], "readonly");
  const afterCatch = await new Promise((resolve) => { const request = after.objectStore(CATCH_STORE_NAME).get("binary-photo-catch"); request.onsuccess = () => resolve(request.result); });
  const afterBinary = await new Promise((resolve) => { const request = after.objectStore(PHOTO_BINARY_STORE_NAME).get(binary.key); request.onsuccess = () => resolve(request.result); });
  afterDb.close();
  assert.equal(afterCatch.photos[0].blob, undefined, "cloud metadata updates do not rewrite a Blob into the Catch record");
  assert.deepEqual(new Uint8Array(afterBinary.bytes), new Uint8Array(binary.bytes));
});

test("catch create, edit, and delete commit an ordered coalesced operation and retain photo/trip data", async () => {
  await deleteDatabase();
  let scope = await guestScope();
  const trip = makeTrip("trip-for-catch", { endedAt: "2026-10-17T10:00:00.000Z" });
  await tripRepository.start(trip, scope);
  const photo = new Blob([new Uint8Array([4, 5, 6, 7])], { type: "image/jpeg" });
  const original = makeCatch("catch-1", { tripId: trip.id, photos: [{ id: "photo-1", blob: photo, type: "image/jpeg" }] });
  const created = await catchRepository.put(original, scope);
  const firstQueue = await outboxRepository.list();
  assert.equal(firstQueue.length, 2);
  assert.deepEqual(firstQueue.map((item) => item.entityType), ["trip", "catch"]);
  assert.equal(firstQueue[1].operation, "upsert");
  assert.equal(firstQueue[1].localRevision, 1);
  const operationId = firstQueue[1].operationId;

  const updated = await catchRepository.put({ ...created, updatedAt: "2026-10-17T09:01:00.000Z", weightKg: 8.5, sync: { ...created.sync, revision: 2 } }, scope);
  assert.equal(updated.sync.revision, 2);
  let queue = await outboxRepository.list();
  assert.equal(queue.length, 2);
  assert.equal(queue[1].operationId, operationId);
  assert.equal(queue[1].localRevision, 2);
  const stored = await catchRepository.get("catch-1", scope);
  assert.equal(stored.tripId, trip.id);
  assert.equal(stored.weightKg, 8.5);
  assert.equal(stored.photos[0].blob.size, 4);

  await catchRepository.delete("catch-1", scope);
  queue = await outboxRepository.list();
  assert.equal(queue.length, 2);
  assert.equal(queue[1].operation, "delete");
  assert.equal(queue[1].localRevision, 3);
  assert.equal(queue[1].operationId, operationId);
  assert.equal(await catchRepository.get("catch-1", scope), undefined);
});

test("favorite state is persisted and restored from the local journal", async () => {
  await deleteDatabase();
  const scope = await guestScope();
  const original = await catchRepository.put(makeCatch("favorite-catch"), scope);
  await catchRepository.put({ ...original, isFavorite: true, sync: { ...original.sync, revision: original.sync.revision + 1 } }, scope);

  const reloaded = await catchRepository.list(scope);
  assert.equal(reloaded.find((record) => record.id === "favorite-catch")?.isFavorite, true);
});

test("trip start, end, and deletion produce upsert and tombstone operations", async () => {
  await deleteDatabase();
  let scope = await guestScope();
  const trip = makeTrip("trip-1");
  await tripRepository.start(trip, scope);
  const startedQueue = await outboxRepository.list();
  assert.equal(startedQueue.length, 1);
  assert.equal(startedQueue[0].operation, "upsert");

  const ended = await tripRepository.put({ ...trip, endedAt: "2026-10-17T10:00:00.000Z", sync: { status: "local", revision: 2 } }, scope);
  assert.equal(ended.sync.revision, 2);
  let queue = await outboxRepository.list();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].localRevision, 2);

  await tripRepository.delete(trip.id, scope);
  queue = await outboxRepository.list();
  assert.equal(queue[0].operation, "delete");
  assert.equal(queue[0].localRevision, 3);
  assert.equal(await tripRepository.get(trip.id, scope), undefined);
});

test("an outbox write failure aborts the entity write in the same transaction", async () => {
  await deleteDatabase();
  let scope = await guestScope();
  await outboxRepository.list();
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function failOutboxWrite(value, ...args) {
    if (this.name === "outbox") throw new Error("simulované selhání zápisu fronty");
    return originalAdd.call(this, value, ...args);
  };
  try {
    await assert.rejects(catchRepository.put(makeCatch("must-rollback"), scope));
  } finally {
    IDBObjectStore.prototype.add = originalAdd;
  }

  assert.equal(await catchRepository.get("must-rollback", scope), undefined);
  const queue = await outboxRepository.list();
  assert.equal(queue.length, 0);
});

test("queued changes persist across database reopen and acknowledgements require the exact revision", async () => {
  await deleteDatabase();
  let scope = await guestScope();
  await catchRepository.put(makeCatch("persisted"), scope);
  const pending = (await outboxRepository.list())[0];
  assert.equal(pending.status, "pending");
  assert.equal(pending.ownerId, null);

  const db = await openLocalDatabase();
  db.close();
  assert.equal((await outboxRepository.list())[0].operationId, pending.operationId);
  assert.equal(await outboxRepository.acknowledge(pending.operationId, pending.localRevision + 1), false);
  assert.equal((await outboxRepository.list()).length, 1);
  assert.equal(await outboxRepository.acknowledge(pending.operationId, pending.localRevision), true);
  assert.deepEqual(await outboxRepository.list(), []);
});

test("a newer local edit clears the failure state without losing its latest revision", async () => {
  await deleteDatabase();
  let scope = await guestScope();
  const created = await catchRepository.put(makeCatch("retry-catch"), scope);
  const [pending] = await outboxRepository.list();
  assert.equal(await outboxRepository.markFailed(pending.operationId, "offline"), true);
  const [failed] = await outboxRepository.list();
  assert.equal(failed.status, "failed");
  assert.equal(failed.attemptCount, 1);
  assert.equal(failed.lastError, "offline");

  await catchRepository.put({ ...created, notes: "nový zápis", sync: { ...created.sync, revision: 2 } }, scope);
  const [retried] = await outboxRepository.list();
  assert.equal(retried.status, "pending");
  assert.equal(retried.attemptCount, 0);
  assert.equal(retried.lastError, null);
  assert.equal(retried.localRevision, 2);
});

test("account and guest records remain isolated and cannot transfer ownership", async () => {
  await deleteDatabase();
  const created = await catchRepository.put(makeCatch("account-catch"), { scopeKey: "account:angler-a", ownerId: "angler-a" });
  assert.equal(created.ownerId, "angler-a");
  assert.equal((await outboxRepository.list())[0].ownerId, "angler-a");

  await assert.rejects(
    catchRepository.put({ ...created, notes: "upraveno", sync: { ...created.sync, revision: 2 } }, { scopeKey: "account:angler-b", ownerId: "angler-b" }),
    /nepatří do aktivního profilu/,
  );
  assert.equal((await outboxRepository.list())[0].ownerId, "angler-a");
  await catchRepository.delete(created.id, { scopeKey: "account:angler-a", ownerId: "angler-a" });
  assert.equal((await outboxRepository.list())[0].ownerId, "angler-a");

  await deleteDatabase();
  await seedVersionTwo({ catches: [makeCatch("legacy-catch")] });
  const scope = await guestScope();
  const legacy = await catchRepository.get("legacy-catch", scope);
  const updatedLegacy = await catchRepository.put({ ...legacy, notes: "stále místní" }, scope);
  assert.equal(updatedLegacy.ownerId, null);
  assert.equal((await outboxRepository.list())[0].ownerId, null);
});

test("account-owned trips retain their owner through updates and tombstones", async () => {
  await deleteDatabase();
  const trip = await tripRepository.start(makeTrip("account-trip"), { scopeKey: "account:angler-a", ownerId: "angler-a" });
  assert.equal(trip.ownerId, "angler-a");
  await assert.rejects(tripRepository.put(
    { ...trip, endedAt: "2026-10-17T10:00:00.000Z", sync: { ...trip.sync, revision: 2 } },
    { scopeKey: "account:angler-b", ownerId: "angler-b" },
  ));
  assert.equal((await outboxRepository.list())[0].ownerId, "angler-a");
  await tripRepository.delete(trip.id, { scopeKey: "account:angler-a", ownerId: "angler-a" });
  assert.equal((await outboxRepository.list())[0].operation, "delete");
  assert.equal((await outboxRepository.list())[0].ownerId, "angler-a");
});

test("removing an unuploaded photo and Catch cancels local bytes without creating a cloud delete", async () => {
  await deleteDatabase();
  const scope = { scopeKey: "account:upload-pending-a", ownerId: "upload-pending-a" };
  const otherScope = { scopeKey: "account:upload-pending-b", ownerId: "upload-pending-b" };
  const makePhoto = (id) => ({ id, name: `${id}.jpg`, type: "image/jpeg", blob: new Blob([id], { type: "image/jpeg" }) });
  const binaries = async (ownerScope, catchId) => {
    const db = await openLocalDatabase();
    const transaction = db.transaction(PHOTO_BINARY_STORE_NAME, "readonly");
    const result = await new Promise((resolve, reject) => {
      const request = transaction.objectStore(PHOTO_BINARY_STORE_NAME).index("catchPhoto").getAll([ownerScope.scopeKey, catchId]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  };
  await catchRepository.put(makeCatch("pending-catch", { photos: [makePhoto("photo-a"), makePhoto("photo-b")] }), scope);
  await catchRepository.put(makeCatch("other-catch", { photos: [makePhoto("other-photo")] }), otherScope);
  assert.equal((await binaries(scope, "pending-catch")).length, 2);
  const saved = await catchRepository.get("pending-catch", scope);
  await catchRepository.put({ ...saved, photos: saved.photos.filter((photo) => photo.id === "photo-b"),
    sync: { ...saved.sync, revision: saved.sync.revision + 1 } }, scope);
  assert.deepEqual((await binaries(scope, "pending-catch")).map((item) => item.photoId), ["photo-b"]);
  assert.equal((await outboxRepository.list()).filter((item) => item.entityType === "photoCloud").length, 0);
  await catchRepository.delete("pending-catch", scope);
  assert.equal(await catchRepository.get("pending-catch", scope), undefined);
  assert.equal((await binaries(scope, "pending-catch")).length, 0);
  assert.equal((await binaries(otherScope, "other-catch")).length, 1);
  assert.equal((await outboxRepository.list()).filter((item) => item.entityType === "photoCloud").length, 0);
});

test("deleting Catch cancels a queued photo upload before it can start", async () => {
  await deleteDatabase();
  const ownerId = "pending-owner";
  const scope = { ownerId, scopeKey: `account:${ownerId}` };
  const objectKey = `users/${ownerId}/catches/pending-delete/photos/photo-a/original`;
  const photo = { id: "photo-a", name: "photo-a.jpg", type: "image/jpeg",
    blob: new Blob(["pending bytes"], { type: "image/jpeg" }),
    cloud: { state: "pendingUpload", provider: "cloudinary", objectKey, sha256: "a".repeat(64) } };
  await catchRepository.put(makeCatch("pending-delete", { photos: [photo] }), scope);
  await photoCloudOutboxRepository.enqueue({ ownerId, catchId: "pending-delete", photoId: photo.id,
    operation: "upload", provider: "cloudinary", objectKey, sha256: "a".repeat(64), size: photo.blob.size, contentType: photo.type });
  assert.equal((await photoCloudOutboxRepository.list())[0].operation, "photo-upload");
  await catchRepository.delete("pending-delete", scope);
  const photoJobs = await photoCloudOutboxRepository.list();
  assert.equal(photoJobs.length, 0);
  assert.equal(await catchRepository.get("pending-delete", scope), undefined);
  const db = await openLocalDatabase();
  const binaryCount = await new Promise((resolve, reject) => {
    const request = db.transaction(PHOTO_BINARY_STORE_NAME, "readonly").objectStore(PHOTO_BINARY_STORE_NAME)
      .index("catchPhoto").count([scope.scopeKey, "pending-delete"]);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  assert.equal(binaryCount, 0);
});

test("a missing local cloud state cancels an unstarted upload and preserves cleanup for an in-flight upload", async () => {
  await deleteDatabase();
  const ownerId = "upload-window-owner";
  const scope = { ownerId, scopeKey: `account:${ownerId}` };
  for (const catchId of ["not-started", "already-uploading"]) {
    const photo = { id: "photo-a", name: "photo-a.jpg", type: "image/jpeg",
      blob: new Blob([catchId], { type: "image/jpeg" }) };
    await catchRepository.put(makeCatch(catchId, { photos: [photo] }), scope);
    await photoCloudOutboxRepository.enqueue({ ownerId, catchId, photoId: photo.id,
      operation: "upload", provider: "cloudinary",
      objectKey: `users/${ownerId}/catches/${catchId}/photos/${photo.id}/original`,
      sha256: "a".repeat(64), size: photo.blob.size, contentType: photo.type });
    if (catchId === "already-uploading") {
      const uploading = (await photoCloudOutboxRepository.list()).find((item) => item.entityId === `${catchId}/${photo.id}`);
      await photoCloudOutboxRepository.setStage(uploading.operationId, uploading.localRevision, "uploading");
    }
    await catchRepository.delete(catchId, scope);
    const matchingJobs = (await photoCloudOutboxRepository.list()).filter((item) => item.entityId === `${catchId}/${photo.id}`);
    assert.equal(matchingJobs.length, catchId === "not-started" ? 0 : 1);
    if (matchingJobs.length) assert.equal(matchingJobs[0].operation, "photo-delete");
  }
});

test("removing one pending photo cancels its upload while a synced photo still queues cloud cleanup", async () => {
  await deleteDatabase();
  const ownerId = "mixed-photo-owner";
  const scope = { ownerId, scopeKey: `account:${ownerId}` };
  const objectKey = (photoId) => `users/${ownerId}/catches/mixed/photos/${photoId}/original`;
  const pending = { id: "pending", name: "pending.jpg", type: "image/jpeg",
    blob: new Blob(["pending"], { type: "image/jpeg" }),
    cloud: { state: "pendingUpload", provider: "cloudinary", objectKey: objectKey("pending"), sha256: "a".repeat(64) } };
  const synced = { id: "synced", name: "synced.jpg", type: "image/jpeg",
    cloud: { state: "synced", provider: "cloudinary", objectKey: objectKey("synced"), sha256: "b".repeat(64) } };
  await catchRepository.put(makeCatch("mixed", { photos: [pending, synced] }), scope);
  await photoCloudOutboxRepository.enqueue({ ownerId, catchId: "mixed", photoId: pending.id,
    operation: "upload", provider: "cloudinary", objectKey: objectKey("pending"),
    sha256: "a".repeat(64), size: pending.blob.size, contentType: pending.type });
  const saved = await catchRepository.get("mixed", scope);
  await catchRepository.put({ ...saved, photos: [], sync: { ...saved.sync, revision: saved.sync.revision + 1 } }, scope);
  const jobs = await photoCloudOutboxRepository.list();
  assert.deepEqual(jobs.map((job) => [job.entityId, job.operation]), [["mixed/synced", "photo-delete"]]);
  const db = await openLocalDatabase();
  const binaryCount = await new Promise((resolve, reject) => {
    const request = db.transaction(PHOTO_BINARY_STORE_NAME, "readonly").objectStore(PHOTO_BINARY_STORE_NAME)
      .index("catchPhoto").count([scope.scopeKey, "mixed"]);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  assert.equal(binaryCount, 0);
});
