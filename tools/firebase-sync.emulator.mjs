import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
} from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from "firebase/firestore";
import "fake-indexeddb/auto";
import { catchRepository, outboxRepository } from "../src/features/catches/data/catchRepository.js";
import { createFirestoreSyncAdapter } from "../src/features/sync/data/firestoreSyncAdapter.js";
import { createSyncPort } from "../src/features/sync/data/syncPort.js";
import { createSyncService } from "../src/features/sync/data/syncService.js";
import { tripRepository } from "../src/features/trips/data/tripRepository.js";

const projectId = "demo-chytnucz-local";
const app = initializeApp({ apiKey: "demo-api-key", authDomain: "localhost", projectId }, `sync-test-${crypto.randomUUID()}`);
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
const uid = `sync-${crypto.randomUUID()}`;
const email = `${uid}@example.test`;
const password = "local-sync-test-password-123";

function serviceFor(adapter) {
  return createSyncService({ port: createSyncPort(adapter), getCurrentOwnerId: () => auth.currentUser?.uid ?? null });
}

try {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  const ownerId = user.uid;
  const firestoreAdapter = createFirestoreSyncAdapter({ db, getCurrentUserId: () => auth.currentUser?.uid ?? null });
  const firestoreService = serviceFor(firestoreAdapter);
  const stamp = new Date().toISOString();
  const tripId = `trip-${crypto.randomUUID()}`;
  const catchId = `catch-${crypto.randomUUID()}`;

  await tripRepository.start({
    schemaVersion: 1, id: tripId, title: "Testovací výprava", locationName: "Labe",
    methodKey: null, createdAt: stamp, updatedAt: stamp, startedAt: stamp, endedAt: null,
    sync: { status: "local", revision: 1 },
  }, { ownerId });
  const photoBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  await catchRepository.put({
    schemaVersion: 1, id: catchId, ownerId, createdAt: stamp, updatedAt: stamp, caughtAt: stamp,
    species: "Kapr", speciesKey: "carp", speciesLatin: null, weightKg: null, lengthCm: null,
    girthCm: null, fightMinutes: null, locationName: "Labe", waterNumber: null, gpsLocation: "50.087, 14.421",
    coordinates: { latitude: 50.087, longitude: 14.421 },
    waterDepthM: null, bottomType: null, tripId, method: null, baits: [], result: "released",
    photos: [{ id: "photo-1", name: "kapr.jpg", type: "image/jpeg", blob: photoBlob }],
    notes: "emulator integration fixture", isFavorite: false, sync: { status: "local", revision: 1 },
  }, { ownerId });

  const first = await firestoreService.run(ownerId);
  assert.equal(first.status, "success", first.error);
  assert.equal(first.sent, 2);
  assert.equal((await outboxRepository.list()).length, 0);

  const remoteTrip = await getDoc(doc(db, "users", ownerId, "trips", tripId));
  const remoteCatch = await getDoc(doc(db, "users", ownerId, "catches", catchId));
  assert.equal(remoteTrip.data().title, "Testovací výprava");
  assert.equal(remoteCatch.data().tripId, tripId);
  assert.deepEqual(remoteCatch.data().coordinates, { latitude: 50.087, longitude: 14.421 });
  assert.deepEqual(remoteCatch.data().photos, [{ id: "photo-1", name: "kapr.jpg", type: "image/jpeg", size: 3 }]);
  assert.equal(JSON.stringify(remoteCatch.data()).includes("blob"), false);

  const local = await catchRepository.get(catchId);
  assert.equal(local.photos[0].blob.size, 3, "Firestore metadata sync must preserve local photo bytes");
  assert.equal(local.sync.photoStatus, "local-only");
  const replay = await firestoreAdapter.write({
    ownerId, entityType: "catch", entityId: catchId, record: local, expectedRevision: null,
    operationId: remoteCatch.data().lastOperationId, localRevision: 1,
  });
  assert.equal(replay.revision, remoteCatch.data().serverRevision, "same operation replay must not create a new revision");

  await assert.rejects(() => firestoreAdapter.write({
    ownerId, entityType: "catch", entityId: catchId,
    record: { ...local, coordinates: { latitude: 91, longitude: 14.421 } },
    expectedRevision: remoteCatch.data().serverRevision,
    operationId: `invalid-coordinates-${crypto.randomUUID()}`, localRevision: 2,
  }), /nepodařilo|oprávnění|permission/i, "out-of-range coordinates must be rejected by Firestore rules");

  await firestoreAdapter.write({
    ownerId, entityType: "catch", entityId: catchId,
    record: { ...local, notes: "změna z druhého zařízení" }, expectedRevision: remoteCatch.data().serverRevision,
    operationId: `other-device-${crypto.randomUUID()}`, localRevision: 1,
  });
  const pulled = await firestoreService.run(ownerId);
  assert.equal(pulled.status, "success", pulled.error);
  assert.equal((await catchRepository.get(catchId)).notes, "změna z druhého zařízení");
  assert.deepEqual((await catchRepository.get(catchId)).coordinates, { latitude: 50.087, longitude: 14.421 });
  assert.equal((await catchRepository.get(catchId)).photos[0].blob.size, 3, "remote metadata update must preserve the local Blob");

  const repeated = await firestoreService.run(ownerId);
  assert.equal(repeated.status, "success", repeated.error);

  // Exercise deletion as a durable tombstone, not a Firestore document delete.
  await catchRepository.delete(catchId);
  const deleted = await firestoreService.run(ownerId);
  assert.equal(deleted.status, "success", deleted.error);
  const tombstone = await getDoc(doc(db, "users", ownerId, "catches", catchId));
  assert.equal(tombstone.data().deleted, true);
  assert.equal((await outboxRepository.list()).length, 0);

  console.log("Firestore sync emulator passed: authenticated Trip/Catch writes, trip linkage, photo metadata-only projection, retained local Blob, exact operation replay, remote delta pull, idempotent resync, durable deletion tombstone, and clean outbox.");
} finally {
  await deleteApp(app);
}
