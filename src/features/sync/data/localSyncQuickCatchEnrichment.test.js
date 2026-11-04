import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import test from "node:test";
import assert from "node:assert/strict";
import { catchRepository, outboxRepository, openLocalDatabase, PHOTO_BINARY_STORE_NAME, OUTBOX_STORE_NAME } from "../../catches/data/catchRepository.js";
import { createSyncPort } from "./syncPort.js";
import { createInMemorySyncAdapter } from "./inMemorySyncAdapter.js";
import { createSyncService } from "./syncService.js";
import { listSyncConflicts, applyRemotePage } from "./localSyncRepository.js";
import { sha256Blob } from "../../catches/data/photoCloudProvider.js";

const ownerId = "quick-angler";
const scope = { ownerId, scopeKey: `account:${ownerId}` };
const timestamp = "2026-11-04T12:00:00.000Z";
const job = (status = "pending", attempts = 0) => ({ status, attempts, nextAttemptAt: null });
async function makeCatch() {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
  return { schemaVersion: 1, id: "quick-catch", ownerId, createdAt: timestamp, updatedAt: timestamp, caughtAt: timestamp,
    speciesKey: "", species: "Druh zatím neurčen", speciesLatin: null, lengthCm: null, weightKg: null, girthCm: null,
    fightMinutes: null, locationName: "", waterNumber: null, gpsLocation: "50, 14", coordinates: { latitude: 50, longitude: 14 },
    gpsSource: "photo-exif", catchDateTimeSource: "default", conditions: null, conditionSources: {}, waterDepthM: null,
    bottomType: null, tripId: null, method: null, baits: [], result: "unspecified", notes: "", isFavorite: false,
    captureMode: "quick", quickCatch: { capturedAt: timestamp, inputSource: "gallery", timeZone: "Europe/Prague",
      timezoneOffsetMinutes: -60, provenance: { caughtAt: "device", coordinates: "exif" },
      enrichment: { metadata: job("complete"), weather: job() } },
    photos: [{ id: "photo-1", name: "ulovek.jpg", type: "image/jpeg", size: blob.size, blob, contentSha256: await sha256Blob(blob) }],
    sync: { status: "local", revision: 1 } };
}

async function devices(fn) {
  const original = globalThis.indexedDB;
  const a = new IDBFactory(); const b = new IDBFactory();
  const port = createSyncPort(createInMemorySyncAdapter());
  const serviceA = createSyncService({ port, getCurrentOwnerId: () => ownerId });
  const serviceB = createSyncService({ port, getCurrentOwnerId: () => ownerId });
  try {
    globalThis.indexedDB = a;
    const first = await catchRepository.put(await makeCatch(), scope);
    await serviceA.run(ownerId);
    globalThis.indexedDB = b;
    await serviceB.run(ownerId);
    await fn({ a, b, port, serviceA, serviceB, first });
  } finally { globalThis.indexedDB = original; }
}

async function enrich() {
  const record = await catchRepository.getMetadata("quick-catch", scope);
  return catchRepository.patchQuickCatchEnrichment(record.id, record.sync.revision, {
    values: { conditions: { airTempC: 12, pressureHpa: 1001 } },
    provenance: { airTempC: "weather_api", pressureHpa: "weather_api" }, jobs: { weather: job("complete", 1) },
  }, scope);
}

async function manualEdit(values) {
  const record = await catchRepository.getMetadata("quick-catch", scope);
  return catchRepository.put({ ...record, ...values, sync: { ...record.sync, revision: record.sync.revision + 1 } }, scope);
}

test("two devices: remote manual species/length/notes win while safe missing weather rebases without a conflict", async () => {
  await devices(async ({ a, b, port, serviceA, serviceB, first }) => {
    globalThis.indexedDB = a;
    await enrich();
    assert.equal((await outboxRepository.list()).find((op) => op.entityType === "catch").automaticEnrichment, true);
    globalThis.indexedDB = b;
    const bRecord = await catchRepository.getMetadata("quick-catch", scope);
    await manualEdit({ speciesKey: "pike", species: "Štika obecná", lengthCm: 55, notes: "Opraveno rybářem",
      conditions: { airTempC: 7 }, conditionSources: { airTempC: "manual" }, quickCatch: { ...bRecord.quickCatch,
        provenance: { ...bRecord.quickCatch.provenance, speciesKey: "manual", lengthCm: "manual", airTempC: "manual" } } });
    await serviceB.run(ownerId);
    globalThis.indexedDB = a;
    const result = await serviceA.run(ownerId);
    assert.equal(result.status, "success");
    assert.equal(result.conflicts, 0);
    const local = await catchRepository.get("quick-catch", scope);
    assert.equal(local.speciesKey, "pike"); assert.equal(local.lengthCm, 55); assert.equal(local.notes, "Opraveno rybářem");
    assert.deepEqual(local.conditions, { airTempC: 7, pressureHpa: 1001 });
    assert.equal(await local.photos[0].blob.text(), await first.photos[0].blob.text());
    assert.equal((await listSyncConflicts(ownerId)).length, 0);
    assert.equal((await outboxRepository.list()).filter((op) => op.entityType === "catch").length, 0);
    const remote = await port.read({ ownerId, entityType: "catch", entityId: local.id });
    assert.equal(remote.record.speciesKey, "pike"); assert.equal(remote.record.lengthCm, 55);
    globalThis.indexedDB = b;
    await serviceB.run(ownerId);
    const other = await catchRepository.getMetadata(local.id, scope);
    assert.equal(other.speciesKey, "pike"); assert.deepEqual(other.conditions, { airTempC: 7, pressureHpa: 1001 });
  });
});

test("automatic coalescing cannot mark a capture or manual operation automatic-only", async () => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  try {
    await catchRepository.put(await makeCatch(), scope);
    await enrich();
    assert.equal((await outboxRepository.list()).find((op) => op.entityType === "catch").automaticEnrichment, false);
  } finally { globalThis.indexedDB = original; }
  await devices(async ({ a }) => {
    globalThis.indexedDB = a;
    await enrich();
    await manualEdit({ notes: "Moje ruční poznámka" });
    await enrich();
    assert.equal((await outboxRepository.list()).find((op) => op.entityType === "catch").automaticEnrichment, false);
  });
});

test("genuine concurrent manual edits retain the existing explicit conflict behavior", async () => {
  await devices(async ({ a, b, serviceA, serviceB }) => {
    globalThis.indexedDB = a;
    await enrich(); await manualEdit({ notes: "Ruční poznámka A" });
    globalThis.indexedDB = b;
    await manualEdit({ notes: "Ruční poznámka B" }); await serviceB.run(ownerId);
    globalThis.indexedDB = a;
    const result = await serviceA.run(ownerId);
    assert.ok(result.conflicts > 0);
    assert.equal((await listSyncConflicts(ownerId)).length, 1);
    assert.equal((await catchRepository.getMetadata("quick-catch", scope)).notes, "Ruční poznámka A");
  });
});

test("manual date/location changes invalidate old automatic weather", async () => {
  await devices(async ({ a, b, serviceA, serviceB }) => {
    globalThis.indexedDB = a; await enrich();
    globalThis.indexedDB = b;
    await manualEdit({ caughtAt: "2025-01-01T10:00:00.000Z", catchDateTimeSource: "manual",
      coordinates: { latitude: 49, longitude: 15 }, gpsSource: "manual-map" });
    await serviceB.run(ownerId);
    globalThis.indexedDB = a; await serviceA.run(ownerId);
    const record = await catchRepository.getMetadata("quick-catch", scope);
    assert.equal(record.caughtAt, "2025-01-01T10:00:00.000Z");
    assert.deepEqual(record.coordinates, { latitude: 49, longitude: 15 });
    assert.equal(record.conditions, null);
    assert.equal((await listSyncConflicts(ownerId)).length, 0);
  });
});

test("remote deletion wins over automatic enrichment and clears local photo bytes/upload jobs", async () => {
  await devices(async ({ a, b, serviceA, serviceB }) => {
    globalThis.indexedDB = a; await enrich();
    const db = await openLocalDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE_NAME, "readwrite");
      tx.objectStore(OUTBOX_STORE_NAME).add({ operationId: "pending-photo-upload", entityKey: "upload-key", ownerId,
        scopeKey: scope.scopeKey, entityType: "photoCloud", operation: "photo-upload", localRevision: 1,
        photoCloud: { catchId: "quick-catch", photoId: "photo-1" } });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close();
    globalThis.indexedDB = b; await catchRepository.delete("quick-catch", scope); await serviceB.run(ownerId);
    globalThis.indexedDB = a;
    const result = await serviceA.run(ownerId);
    assert.equal(result.conflicts, 0);
    assert.equal(await catchRepository.getMetadata("quick-catch", scope), undefined);
    assert.equal((await outboxRepository.list()).length, 0);
    const photoDb = await openLocalDatabase();
    const count = await new Promise((resolve, reject) => {
      const request = photoDb.transaction(PHOTO_BINARY_STORE_NAME, "readonly").objectStore(PHOTO_BINARY_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result.length); request.onerror = () => reject(request.error);
    }); photoDb.close();
    assert.equal(count, 0);
  });
});

test("untrusted owner snapshots and incomplete photo metadata cannot use automatic rebase", async () => {
  await devices(async ({ a }) => {
    globalThis.indexedDB = a; await enrich();
    const local = await catchRepository.getMetadata("quick-catch", scope);
    for (const extra of [{ photoMetadataError: new Error("photos unavailable") }, { record: { ...local, ownerId: "other-owner" } }]) {
      const result = await applyRemotePage({ ownerId, cursor: null, snapshots: [{ entityType: "catch", entityId: local.id,
        remote: { entityType: "catch", entityId: local.id, revision: 2, deleted: false, record: local, ...extra }, change: { revision: 2 } }] });
      assert.equal(result.conflicts, extra.photoMetadataError ? 0 : 1);
      assert.equal((await catchRepository.getMetadata(local.id, scope)).ownerId, ownerId);
    }
  });
});

test("transient photo metadata defers automatic rebase; recovered and repeated pages remain idempotent", async () => {
  await devices(async ({ a, b, port, serviceA, serviceB }) => {
    globalThis.indexedDB = a; await enrich();
    globalThis.indexedDB = b; await manualEdit({ speciesKey: "pike", species: "Štika obecná" }); await serviceB.run(ownerId);
    const remote = await port.read({ ownerId, entityType: "catch", entityId: "quick-catch" });
    globalThis.indexedDB = a;
    const snapshot = { entityType: "catch", entityId: "quick-catch", remote, change: { revision: remote.revision } };
    const partial = await applyRemotePage({ ownerId, cursor: null,
      snapshots: [{ ...snapshot, remote: { ...remote, photoMetadataError: { code: "unavailable" } } }] });
    assert.equal(partial.applied, 0); assert.equal(partial.conflicts, 0);
    assert.equal((await listSyncConflicts(ownerId)).length, 0);
    const first = await applyRemotePage({ ownerId, cursor: null, snapshots: [snapshot] });
    assert.equal(first.applied, 1); assert.equal(first.conflicts, 0);
    const operationId = (await outboxRepository.list()).find((op) => op.entityType === "catch").operationId;
    const replay = await applyRemotePage({ ownerId, cursor: null, snapshots: [snapshot] });
    assert.equal(replay.conflicts, 0);
    assert.equal((await outboxRepository.list()).find((op) => op.entityType === "catch").operationId, operationId);
    assert.equal((await serviceA.run(ownerId)).conflicts, 0);
    assert.equal((await outboxRepository.list()).filter((op) => op.entityType === "catch").length, 0);
  });
});

test("a remote replacement photograph invalidates local automatic evidence and removes stale binary", async () => {
  await devices(async ({ a, b, serviceA, serviceB }) => {
    globalThis.indexedDB = a; await enrich();
    globalThis.indexedDB = b;
    const newBlob = new Blob([new Uint8Array([9, 8, 7])], { type: "image/jpeg" });
    await manualEdit({ notes: "Jiná fotografie", photos: [{ id: "photo-replacement", type: "image/jpeg", name: "new.jpg",
      blob: newBlob, size: newBlob.size, contentSha256: await sha256Blob(newBlob) }] });
    await serviceB.run(ownerId);
    globalThis.indexedDB = a;
    assert.equal((await serviceA.run(ownerId)).conflicts, 0);
    const record = await catchRepository.getMetadata("quick-catch", scope);
    assert.equal(record.photos[0].id, "photo-replacement");
    assert.equal(record.notes, "Jiná fotografie");
    assert.equal(record.conditions, null);
    const db = await openLocalDatabase();
    const photos = await new Promise((resolve, reject) => {
      const request = db.transaction(PHOTO_BINARY_STORE_NAME, "readonly").objectStore(PHOTO_BINARY_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }); db.close();
    assert.equal(photos.some((photo) => photo.photoId === "photo-1"), false);
  });
});

test("same-ID remote photo replacement cannot retain or upload the previous binary", async () => {
  await devices(async ({ a, b, serviceA, serviceB }) => {
    globalThis.indexedDB = a; await enrich();
    globalThis.indexedDB = b;
    const replacement = new Blob([new Uint8Array([9, 8, 7])], { type: "image/jpeg" });
    const hash = await sha256Blob(replacement);
    await manualEdit({ photos: [{ id: "photo-1", name: "replacement.jpg", type: replacement.type,
      blob: replacement, size: replacement.size, contentSha256: hash,
      cloud: { state: "synced", provider: "cloudinary", objectKey: `users/${ownerId}/catches/quick-catch/photos/photo-1/original`, sha256: hash } }] });
    await serviceB.run(ownerId);
    globalThis.indexedDB = a;
    assert.equal((await serviceA.run(ownerId)).conflicts, 0);
    const received = await catchRepository.get("quick-catch", scope);
    assert.equal(received.photos[0].cloud.sha256, hash);
    assert.equal(received.photos[0].blob, undefined);
    assert.equal(received.conditions, null);
    const db = await openLocalDatabase();
    const bytes = await new Promise((resolve, reject) => {
      const request = db.transaction(PHOTO_BINARY_STORE_NAME).objectStore(PHOTO_BINARY_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }); db.close();
    assert.equal(bytes.length, 0);
    assert.equal((await outboxRepository.list()).filter(op => op.operation === "photo-upload").length, 0);
  });
});
