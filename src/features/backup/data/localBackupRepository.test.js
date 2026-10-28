import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { catchRepository, NOTIFICATION_STORE_NAME, openLocalDatabase } from "../../catches/data/catchRepository.js";
import { readLocalBackupSnapshot } from "./localBackupRepository.js";
import { createLocalBackupDocument } from "./backupFormat.js";
import { parseLocalBackupDocument, restoreLocalBackup } from "./backupRestore.js";

test("local backup snapshot includes notifications only from the selected guest scope", async () => {
  const scopeKey = `guest:${crypto.randomUUID()}`;
  const otherScopeKey = `guest:${crypto.randomUUID()}`;
  const db = await openLocalDatabase();
  const transaction = db.transaction([NOTIFICATION_STORE_NAME, "catches", "photoBinaries"], "readwrite");
  const notificationStore = transaction.objectStore(NOTIFICATION_STORE_NAME);
  notificationStore.put({ id: "backup-notification", type: "challenge", title: "Výzva", body: "Dokončena.",
    createdAt: "2026-10-28T10:00:00.000Z", readAt: null, deepLink: "/challenges", scopeKey, ownerId: null });
  notificationStore.put({ id: "other-notification", type: "challenge", title: "Jiná", body: "Jiný profil.",
    createdAt: "2026-10-28T10:00:00.000Z", readAt: null, deepLink: "/challenges", scopeKey: otherScopeKey, ownerId: null });
  const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00]);
  transaction.objectStore("catches").put({ id: "catch-with-binary", scopeKey, photos: [{ id: "photo-from-binary-store", type: "image/jpeg", name: "catch.jpg" }] });
  transaction.objectStore("photoBinaries").put({
    key: JSON.stringify([scopeKey, "catch-with-binary", "photo-from-binary-store"]), scopeKey,
    catchId: "catch-with-binary", photoId: "photo-from-binary-store", type: "image/jpeg", size: photoBytes.byteLength,
    bytes: photoBytes.buffer,
  });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();

  const snapshot = await readLocalBackupSnapshot({ scopeKey, ownerId: null });
  assert.deepEqual(snapshot.notifications.map((record) => record.id), ["backup-notification"]);
  assert.equal(snapshot.notifications[0].readAt, null);
  assert.deepEqual(new Uint8Array(await snapshot.catches[0].photos[0].blob.arrayBuffer()), photoBytes);
  const backup = await createLocalBackupDocument({ ...snapshot, createdAt: new Date("2026-10-28T12:00:00.000Z") });
  assert.equal(backup.records.catches[0].photos[0].blobSize, 5);
  assert.equal(backup.records.notifications[0].id, "backup-notification");
});

test("restored backup photo bytes are stored in and hydrated from the normal IndexedDB binary store", async () => {
  const scope = { scopeKey: `guest:${crypto.randomUUID()}`, ownerId: null };
  const timestamp = "2026-10-28T11:00:00.000Z";
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00])], { type: "image/jpeg" });
  const document = await createLocalBackupDocument({
    catches: [{
      schemaVersion: 1, id: `catch-${crypto.randomUUID()}`, createdAt: timestamp, updatedAt: timestamp, caughtAt: timestamp,
      speciesKey: "commonCarp", species: "Kapr obecný", speciesLatin: "Cyprinus carpio", weightKg: null,
      lengthCm: 72, girthCm: null, fightMinutes: null, locationName: "", waterId: null, waterNumber: null,
      gpsLocation: "", coordinates: null, waterDepthM: null, bottomType: null, tripId: null, method: null,
      baits: [], result: "released", notes: "", isFavorite: false, photos: [{ id: "photo-1", name: "catch.jpg", type: blob.type, blob }],
      sync: { status: "local", revision: 1 },
    }],
    trips: [], createdAt: new Date(timestamp),
  });
  const parsed = parseLocalBackupDocument(document);
  await restoreLocalBackup(parsed, "merge", scope);
  const restored = await catchRepository.get(parsed.catches[0].id, scope);
  assert.equal(restored.photos[0].blob.size, blob.size);
  assert.deepEqual(new Uint8Array(await restored.photos[0].blob.arrayBuffer()), new Uint8Array(await blob.arrayBuffer()));
});
