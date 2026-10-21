import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "fake-indexeddb/auto";
import { catchRepository, outboxRepository } from "../src/features/catches/data/catchRepository.js";
import { createInMemorySyncAdapter } from "../src/features/sync/data/inMemorySyncAdapter.js";
import { createSyncPort } from "../src/features/sync/data/syncPort.js";
import { createSyncService } from "../src/features/sync/data/syncService.js";

const databaseName = "chytnu-local";
const ownerId = "photo-local-only-owner";
const scope = { scopeKey: `account:${ownerId}`, ownerId };

async function resetLocalDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Testovací IndexedDB zůstala otevřená."));
  });
}

function service(adapter) {
  return createSyncService({ port: createSyncPort(adapter), getCurrentOwnerId: () => ownerId });
}

await resetLocalDatabase();
const adapter = createInMemorySyncAdapter();
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x10, 0x20]);
const blob = new Blob([bytes], { type: "image/jpeg" });
const now = new Date().toISOString();
const catchId = "local-photo-catch";
await catchRepository.put({
  schemaVersion: 1, id: catchId, ownerId, createdAt: now, updatedAt: now, caughtAt: now,
  species: "Kapr", speciesKey: "carp", speciesLatin: null, weightKg: null, lengthCm: null,
  girthCm: null, fightMinutes: null, locationName: "Labe", waterNumber: null, gpsLocation: "",
  waterDepthM: null, bottomType: null, tripId: null, method: null, baits: [], result: "released",
  photos: [{ id: "photo-1", name: "kapr.jpg", type: "image/jpeg", blob, focalX: 0.25, focalY: 0.75, zoom: 1.4 }],
  notes: "local-only fixture", isFavorite: false, sync: { status: "local", revision: 1 },
}, scope);

const first = await service(adapter).run(ownerId);
assert.equal(first.status, "success", first.error);
assert.equal((await outboxRepository.list()).length, 0);
const local = await catchRepository.get(catchId, scope);
assert.equal(local.photos[0].blob.size, bytes.byteLength, "sync must retain the IndexedDB Blob");
assert.equal(local.sync.photoStatus, "local-only");

const remote = await createSyncPort(adapter).read({ ownerId, entityType: "catch", entityId: catchId });
assert.equal(remote.record.photos[0].blob, undefined, "remote metadata must never contain photo bytes");
assert.equal(remote.record.photos[0].storagePath, undefined, "local-only photos must not expose a Storage path");
assert.equal(remote.record.photos[0].sha256, undefined, "local-only photos must not expose a cloud-object hash");
assert.deepEqual(remote.record.photos[0], {
  id: "photo-1", name: "kapr.jpg", type: "image/jpeg", size: bytes.byteLength,
  focalX: 0.25, focalY: 0.75, zoom: 1.4,
});

await resetLocalDatabase();
const secondDevice = await service(adapter).run(ownerId);
assert.equal(secondDevice.status, "success", secondDevice.error);
const metadataOnly = await catchRepository.get(catchId, scope);
assert.equal(metadataOnly.photos[0].blob, undefined, "another device must not invent unavailable photo bytes");
assert.equal(metadataOnly.photos[0].photoStatus, "metadata-only");

const [syncContextSource, syncServiceSource] = await Promise.all([
  readFile(new URL("../src/features/sync/context/SyncContext.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/features/sync/data/syncService.js", import.meta.url), "utf8"),
]);
assert.doesNotMatch(syncContextSource, /firebase\/storage|createFirebasePhotoStorage|photoStorage/);
assert.doesNotMatch(syncServiceSource, /firebase\/storage|createFirebasePhotoStorage|photoStorage/);

console.log("Local-only photo test passed: IndexedDB retains bytes, Firestore sync carries bounded metadata only, no Firebase Storage path exists, and a second device receives no broken cloud photo bytes.");
