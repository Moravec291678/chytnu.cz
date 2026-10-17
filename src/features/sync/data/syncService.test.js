import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { openLocalDatabase, catchRepository, outboxRepository, CONFLICT_STORE_NAME } from "../../catches/data/catchRepository.js";
import { tripRepository } from "../../trips/data/tripRepository.js";
import { createInMemorySyncAdapter } from "./inMemorySyncAdapter.js";
import { createSyncPort, SyncPortError } from "./syncPort.js";
import { createSyncService } from "./syncService.js";
import {
  linkOwnerlessData,
  listSyncConflicts,
  readOwnerlessSummary,
  readSyncCursor,
  resolveSyncConflict,
} from "./localSyncRepository.js";

const DB_NAME = "chytnu-local";
const stamp = "2026-10-17T08:00:00.000Z";

function makeCatch(id, ownerId = null, overrides = {}) {
  return {
    schemaVersion: 1, id, ownerId, createdAt: stamp, updatedAt: stamp, caughtAt: stamp,
    species: "Kapr", speciesKey: "carp", speciesLatin: null,
    weightKg: null, lengthCm: null, girthCm: null, fightMinutes: null,
    locationName: "Labe", waterNumber: null, gpsLocation: "", waterDepthM: null,
    bottomType: null, tripId: null, method: null, baits: [], result: "released",
    photos: [], notes: "", isFavorite: false, sync: { status: "local", revision: 1 },
    ...overrides,
  };
}

async function resetDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Testovací IndexedDB zůstala otevřená."));
  });
}

async function conflictRecords() {
  const db = await openLocalDatabase();
  try {
    const transaction = db.transaction(CONFLICT_STORE_NAME, "readonly");
    return await new Promise((resolve, reject) => {
      const request = transaction.objectStore(CONFLICT_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

function makeService(adapter = createInMemorySyncAdapter(), options = {}) {
  let ownerId = options.ownerId ?? "angler-a";
  const port = createSyncPort(adapter);
  const service = createSyncService({ port, getCurrentOwnerId: () => ownerId, now: options.now });
  return { service, port, changeOwner: (next) => { ownerId = next; } };
}

test("new account-owned Trip and Catch sync while legacy ownerId:null rows stay local", async () => {
  await resetDatabase();
  const { service, port } = makeService();
  await tripRepository.start({
    schemaVersion: 1, id: "trip-sync", title: "Ranní", locationName: "Labe", methodKey: null,
    createdAt: stamp, updatedAt: stamp, startedAt: stamp, endedAt: null,
    sync: { status: "local", revision: 1 },
  }, { ownerId: "angler-a" });
  const photo = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  await catchRepository.put(makeCatch("catch-sync", "angler-a", {
    tripId: "trip-sync",
    photos: [{ id: "photo-1", name: "kapr.jpg", type: "image/jpeg", blob: photo }],
  }), { ownerId: "angler-a" });
  await catchRepository.put(makeCatch("legacy-local"));

  const result = await service.run("angler-a");
  assert.equal(result.status, "success");
  assert.equal(result.sent, 2);
  assert.equal((await outboxRepository.list()).filter((operation) => operation.ownerId === "angler-a").length, 0);
  assert.equal((await outboxRepository.list()).some((operation) => operation.ownerId === null), true);
  const remoteCatch = await port.read({ ownerId: "angler-a", entityType: "catch", entityId: "catch-sync" });
  assert.equal(remoteCatch.record.tripId, "trip-sync");
  assert.equal(remoteCatch.record.photos[0].blob, undefined);
  const localCatch = await catchRepository.get("catch-sync");
  assert.equal(localCatch.photos[0].blob.size, 3);
  assert.equal(localCatch.sync.status, "metadata-synced");
  assert.equal(localCatch.sync.photoStatus, "local-only");
  assert.equal(await port.read({ ownerId: "angler-a", entityType: "catch", entityId: "legacy-local" }), null);
});

test("a coalesced local edit after server acceptance replays idempotently and advances revision", async () => {
  await resetDatabase();
  const { service, port } = makeService();
  await catchRepository.put(makeCatch("coalesced"), { ownerId: "angler-a" });
  const firstQueue = (await outboxRepository.list())[0];
  const firstRecord = await catchRepository.get("coalesced");
  const firstResult = await port.write({
    ownerId: "angler-a", entityType: "catch", record: firstRecord, expectedRevision: null,
    operationId: firstQueue.operationId, localRevision: firstQueue.localRevision,
  });
  const edited = await catchRepository.put({
    ...firstRecord, notes: "úprava po síťovém zápisu", updatedAt: "2026-10-17T08:05:00.000Z",
    sync: { ...firstRecord.sync, revision: 2 },
  }, { ownerId: "angler-a" });
  assert.equal((await outboxRepository.list())[0].operationId, firstQueue.operationId);
  const result = await service.run("angler-a");
  assert.equal(result.status, "success");
  const remote = await port.read({ ownerId: "angler-a", entityType: "catch", entityId: "coalesced" });
  assert.equal(remote.record.notes, "úprava po síťovém zápisu");
  assert.equal(remote.revision, firstResult.revision + 1);
  assert.equal((await catchRepository.get(edited.id)).sync.serverRevision, remote.revision);
  assert.equal((await outboxRepository.list()).some((item) => item.ownerId === "angler-a"), false);
});

test("pull persists remote data and its cursor; repeated sync is idempotent", async () => {
  await resetDatabase();
  const { service, port } = makeService();
  const remoteRecord = makeCatch("remote-catch", "angler-a", { notes: "jiné zařízení" });
  const write = await port.write({
    ownerId: "angler-a", entityType: "catch", record: remoteRecord,
    expectedRevision: null, operationId: "remote-operation-1", localRevision: 1,
  });
  await service.run("angler-a");
  const local = await catchRepository.get("remote-catch");
  assert.equal(local.notes, "jiné zařízení");
  assert.equal(local.sync.serverRevision, write.revision);
  assert.equal((await outboxRepository.list()).length, 0);
  const cursor = await readSyncCursor("angler-a");
  const repeated = await service.run("angler-a");
  assert.equal(repeated.status, "success");
  assert.equal(await readSyncCursor("angler-a"), cursor);
});

test("different concurrent versions are both preserved and the outbox remains blocked", async () => {
  await resetDatabase();
  const { service, port } = makeService();
  const original = await catchRepository.put(makeCatch("conflict-catch", "angler-a"), { ownerId: "angler-a" });
  await service.run("angler-a");
  await catchRepository.put({ ...original, notes: "lokální", sync: { ...original.sync, revision: 2 } }, { ownerId: "angler-a" });
  const remote = await port.read({ ownerId: "angler-a", entityType: "catch", entityId: "conflict-catch" });
  await port.write({
    ownerId: "angler-a", entityType: "catch",
    record: { ...remote.record, notes: "vzdálená" }, expectedRevision: remote.revision,
    operationId: "other-device-update", localRevision: 1,
  });

  const result = await service.run("angler-a");
  assert.equal(result.conflicts, 1);
  assert.equal((await catchRepository.get("conflict-catch")).notes, "lokální");
  const queue = (await outboxRepository.list()).filter((item) => item.ownerId === "angler-a");
  assert.equal(queue.length, 1);
  assert.equal(queue[0].status, "conflict");
  const [conflict] = await conflictRecords();
  assert.equal(conflict.localRecord.notes, "lokální");
  assert.equal(conflict.remoteRecord.notes, "vzdálená");
});

test("ownerless operations are never sent as whichever account happens to sign in", async () => {
  await resetDatabase();
  await catchRepository.put(makeCatch("ownerless"));
  const { service, port } = makeService();
  await service.run("angler-a");
  assert.equal(await port.read({ ownerId: "angler-a", entityType: "catch", entityId: "ownerless" }), null);
  assert.equal((await outboxRepository.list())[0].ownerId, null);
});

test("ownerless journal is linked only by an explicit atomic action and keeps IDs, links, and Blob", async () => {
  await resetDatabase();
  await tripRepository.start({
    schemaVersion: 1, id: "legacy-trip", title: "Starší výprava", locationName: "Labe", methodKey: null,
    createdAt: stamp, updatedAt: stamp, startedAt: stamp, endedAt: stamp,
    sync: { status: "local", revision: 1 },
  });
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])], { type: "image/jpeg" });
  await catchRepository.put(makeCatch("legacy-catch", null, {
    tripId: "legacy-trip", photos: [{ id: "photo", name: "fish.jpg", type: "image/jpeg", blob }],
  }));
  assert.deepEqual(await readOwnerlessSummary(), { catches: 1, trips: 1, photos: 1 });

  const result = await linkOwnerlessData("angler-a");
  assert.deepEqual(result, { catches: 1, trips: 1, photos: 1 });
  assert.equal((await tripRepository.get("legacy-trip")).ownerId, "angler-a");
  const linkedCatch = await catchRepository.get("legacy-catch");
  assert.equal(linkedCatch.ownerId, "angler-a");
  assert.equal(linkedCatch.tripId, "legacy-trip");
  assert.equal(linkedCatch.photos[0].blob.size, blob.size);
  assert.deepEqual(await readOwnerlessSummary(), { catches: 0, trips: 0, photos: 0 });
  assert.deepEqual((await outboxRepository.list()).map((operation) => operation.ownerId), ["angler-a", "angler-a"]);
  assert.deepEqual(await linkOwnerlessData("angler-a"), { catches: 0, trips: 0, photos: 0 });
});

test("user can resolve a concurrent Catch conflict with the remote or local version", async () => {
  await resetDatabase();
  const adapter = createInMemorySyncAdapter();
  const { service, port } = makeService(adapter);
  const original = await catchRepository.put(makeCatch("resolve-catch", "angler-a"), { ownerId: "angler-a" });
  await service.run("angler-a");
  await catchRepository.put({ ...original, notes: "místní", sync: { ...original.sync, revision: 2 } }, { ownerId: "angler-a" });
  const remote = await port.read({ ownerId: "angler-a", entityType: "catch", entityId: original.id });
  await port.write({
    ownerId: "angler-a", entityType: "catch", record: { ...remote.record, notes: "vzdálená" },
    expectedRevision: remote.revision, operationId: "other-device-resolution", localRevision: 1,
  });
  await service.run("angler-a");
  let [conflict] = await listSyncConflicts("angler-a");
  assert.equal(conflict.remoteRecord.notes, "vzdálená");
  await resolveSyncConflict("angler-a", conflict.id, "remote");
  assert.equal((await catchRepository.get(original.id)).notes, "vzdálená");
  assert.equal((await outboxRepository.list()).length, 0);

  const current = await catchRepository.get(original.id);
  await catchRepository.put({ ...current, notes: "místní vítěz", sync: { ...current.sync, revision: current.sync.revision + 1 } }, { ownerId: "angler-a" });
  const secondRemote = await port.read({ ownerId: "angler-a", entityType: "catch", entityId: original.id });
  await port.write({
    ownerId: "angler-a", entityType: "catch", record: { ...secondRemote.record, notes: "jiná vzdálená" },
    expectedRevision: secondRemote.revision, operationId: "other-device-resolution-2", localRevision: 2,
  });
  await service.run("angler-a");
  [conflict] = await listSyncConflicts("angler-a");
  await resolveSyncConflict("angler-a", conflict.id, "local");
  const completed = await service.run("angler-a");
  assert.equal(completed.status, "success");
  assert.equal((await port.read({ ownerId: "angler-a", entityType: "catch", entityId: original.id })).record.notes, "místní vítěz");
  assert.equal((await listSyncConflicts("angler-a")).length, 0);
});

test("user can resolve a concurrent Trip conflict and complete the queue", async () => {
  await resetDatabase();
  const adapter = createInMemorySyncAdapter();
  const { service, port } = makeService(adapter);
  const original = await tripRepository.start({
    schemaVersion: 1, id: "resolve-trip", title: "Původní", locationName: "Labe", methodKey: null,
    createdAt: stamp, updatedAt: stamp, startedAt: stamp, endedAt: null,
    sync: { status: "local", revision: 1 },
  }, { ownerId: "angler-a" });
  await service.run("angler-a");
  await tripRepository.put({
    ...original, title: "Místní výprava", updatedAt: "2026-10-17T09:00:00.000Z",
    sync: { ...original.sync, revision: 2 },
  }, { ownerId: "angler-a" });
  const remote = await port.read({ ownerId: "angler-a", entityType: "trip", entityId: original.id });
  await port.write({
    ownerId: "angler-a", entityType: "trip",
    record: { ...remote.record, title: "Vzdálená výprava", updatedAt: "2026-10-17T09:01:00.000Z" },
    expectedRevision: remote.revision, operationId: "other-trip-device", localRevision: 1,
  });

  const conflicted = await service.run("angler-a");
  assert.equal(conflicted.conflicts, 1);
  const [conflict] = await listSyncConflicts("angler-a");
  assert.equal(conflict.entityType, "trip");
  assert.equal(conflict.localRecord.title, "Místní výprava");
  assert.equal(conflict.remoteRecord.title, "Vzdálená výprava");
  await resolveSyncConflict("angler-a", conflict.id, "local");
  const completed = await service.run("angler-a");
  assert.equal(completed.status, "success");
  assert.equal((await port.read({ ownerId: "angler-a", entityType: "trip", entityId: original.id })).record.title, "Místní výprava");
  assert.equal((await listSyncConflicts("angler-a")).length, 0);
  assert.equal((await outboxRepository.list()).length, 0);
});

test("unavailable server preserves outbox and a later retry sends it", async () => {
  await resetDatabase();
  const base = createInMemorySyncAdapter();
  let fail = true;
  const adapter = {
    ...base,
    read: (...args) => base.read(...args),
    delta: (...args) => base.delta(...args),
    list: (...args) => base.list(...args),
    delete: (...args) => base.delete(...args),
    write: (...args) => {
      if (fail) {
        fail = false;
        throw new SyncPortError("unavailable", "offline");
      }
      return base.write(...args);
    },
  };
  await catchRepository.put(makeCatch("retry-catch", "angler-a"), { ownerId: "angler-a" });
  const first = makeService(adapter);
  const result = await first.service.run("angler-a");
  assert.equal(result.status, "error");
  assert.equal((await outboxRepository.list())[0].status, "failed");
  const retry = makeService(adapter, { now: () => Date.now() + 60_000 });
  await retry.service.run("angler-a");
  assert.equal((await outboxRepository.list()).length, 0);
});

test("local conflict snapshots do not advance the cursor if the IndexedDB transaction aborts", async () => {
  await resetDatabase();
  const { service, port } = makeService();
  const remoteRecord = makeCatch("abort-cursor", "angler-a");
  const write = await port.write({ ownerId: "angler-a", entityType: "catch", record: remoteRecord, expectedRevision: null, operationId: "abort-op", localRevision: 1 });
  const cursor = await readSyncCursor("angler-a");
  assert.notEqual(cursor, String(write.cursor));
  // The service applies page and cursor in one transaction. A normal run commits both.
  await service.run("angler-a");
  assert.equal(await readSyncCursor("angler-a"), String(write.cursor));
});
