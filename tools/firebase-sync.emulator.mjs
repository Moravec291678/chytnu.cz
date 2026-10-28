import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
} from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore } from "firebase/firestore";
import "fake-indexeddb/auto";
import { catchRepository, outboxRepository } from "../src/features/catches/data/catchRepository.js";
import { createCloudinaryPhotoDeletionService } from "../src/server/cloudinaryPhotoDeletion.js";
import { createFirestoreSyncAdapter, toRemoteRecord } from "../src/features/sync/data/firestoreSyncAdapter.js";
import { createSyncPort } from "../src/features/sync/data/syncPort.js";
import { createSyncService } from "../src/features/sync/data/syncService.js";
import { tripRepository } from "../src/features/trips/data/tripRepository.js";
import { waterRepository } from "../src/features/waters/data/waterRepository.js";

const projectId = "demo-chytnucz-local";
const app = initializeApp({ apiKey: "demo-api-key", authDomain: "localhost", projectId }, `sync-test-${crypto.randomUUID()}`);
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
const adminApp = initializeAdminApp({ projectId }, `sync-admin-${crypto.randomUUID()}`);
const adminDb = getAdminFirestore(adminApp);
const uid = `sync-${crypto.randomUUID()}`;
const email = `${uid}@example.test`;
const password = `Local-sync-${crypto.randomUUID()}-9a!`;

function serviceFor(adapter) {
  return createSyncService({ port: createSyncPort(adapter), getCurrentOwnerId: () => auth.currentUser?.uid ?? null });
}

try {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  const ownerId = user.uid;
  const accountScope = { scopeKey: `account:${ownerId}`, ownerId };
  const firestoreAdapter = createFirestoreSyncAdapter({ db, getCurrentUserId: () => auth.currentUser?.uid ?? null });
  const firestoreService = serviceFor(firestoreAdapter);
  const stamp = new Date().toISOString();
  const tripId = `trip-${crypto.randomUUID()}`;
  const catchId = `catch-${crypto.randomUUID()}`;
  const waterId = `water-${crypto.randomUUID()}`;

  await tripRepository.start({
    schemaVersion: 1, id: tripId, title: "Testovací výprava", locationName: "Labe",
    methodKey: null, createdAt: stamp, updatedAt: stamp, startedAt: stamp, endedAt: null,
    sync: { status: "local", revision: 1 },
  }, accountScope);
  await waterRepository.put({
    schemaVersion: 1, id: waterId, ownerId, name: "Labe", waterNumber: "411050", type: "Řeka", area: null,
    coordinates: { latitude: 50.087, longitude: 14.421 }, notes: "emulator water", targetFish: ["Kapr"],
    isFavorite: false, moderationStatus: "pending", createdAt: stamp, updatedAt: stamp, sync: { status: "local", revision: 1 },
  }, accountScope);
  const photoBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  await catchRepository.put({
    schemaVersion: 1, id: catchId, ownerId, createdAt: stamp, updatedAt: stamp, caughtAt: stamp,
    species: "Kapr", speciesKey: "carp", speciesLatin: null, weightKg: null, lengthCm: null,
    girthCm: null, fightMinutes: null, locationName: "Labe", waterNumber: null, gpsLocation: "50.087, 14.421",
    coordinates: { latitude: 50.087, longitude: 14.421 },
    gpsSource: "manual-map",
    conditions: { airTempC: 11, moonPhase: "full" },
    conditionSources: { airTempC: "auto", moonPhase: "auto" },
    verification: { status: "unverified", level: "limited", reason: "missing-location", photoHash: null, photoCaptureMetadata: null, locationSource: null, gpsAccuracyMeters: null, verifiedAt: null },
    waterDepthM: null, bottomType: null, tripId, method: null, baits: [], result: "released",
    photos: Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index + 1}`, name: `kapr-${index + 1}.jpg`, type: "image/jpeg", blob: photoBlob, focalX: 0.2, focalY: 0.8, zoom: 1.4 })),
    notes: "emulator integration fixture", isFavorite: false, sync: { status: "local", revision: 1 },
  }, accountScope);

  const queuedBeforeFirstSync = await outboxRepository.list();
  assert.equal(queuedBeforeFirstSync.length, 3, `Unexpected outbox before first sync: ${JSON.stringify(queuedBeforeFirstSync)}`);
  const first = await firestoreService.run(ownerId);
  assert.equal(first.status, "success", first.error);
  assert.equal(first.sent, 3, `Unexpected first sync result: ${JSON.stringify(first)}; outbox: ${JSON.stringify(await outboxRepository.list())}`);
  assert.equal((await outboxRepository.list()).length, 0);

  const remoteTrip = await getDoc(doc(db, "users", ownerId, "trips", tripId));
  const remoteCatch = await getDoc(doc(db, "users", ownerId, "catches", catchId));
  const remoteWater = await getDoc(doc(db, "users", ownerId, "waters", waterId));
  assert.equal(remoteTrip.data().title, "Testovací výprava");
  assert.equal(remoteCatch.data().tripId, tripId);
  assert.equal(remoteWater.data().name, "Labe");
  assert.equal(remoteWater.data().id, waterId);
  assert.deepEqual(remoteCatch.data().coordinates, { latitude: 50.087, longitude: 14.421 });
  assert.equal(remoteCatch.data().gpsSource, "manual-map");
  assert.equal(remoteCatch.data().verification.level, "limited");
  assert.deepEqual(remoteCatch.data().conditions, { airTempC: 11, moonPhase: "full" });
  assert.deepEqual(remoteCatch.data().conditionSources, { airTempC: "auto", moonPhase: "auto" });
  assert.equal("photos" in remoteCatch.data(), false, "Photo metadata must not share the Catch document");
  assert.equal(Object.keys(remoteCatch.data().photoRefs).length, 4, "new Catch retains at most four stable photo references");
  assert.equal("photoIds" in remoteCatch.data(), false);
  assert.equal(remoteCatch.data().primaryPhotoId, "photo-1");
  const remotePhotos = await getDocs(collection(db, "users", ownerId, "catches", catchId, "photos"));
  assert.equal(remotePhotos.size, 4, "each photo is stored and validated as its own document");
  const firstRemotePhoto = remotePhotos.docs.find((photo) => photo.id === "photo-1").data();
  assert.deepEqual({ id: firstRemotePhoto.id, name: firstRemotePhoto.name, type: firstRemotePhoto.type, size: firstRemotePhoto.size, focalX: firstRemotePhoto.focalX, focalY: firstRemotePhoto.focalY, zoom: firstRemotePhoto.zoom }, {
    id: "photo-1", name: "kapr-1.jpg", type: "image/jpeg", size: 3,
    focalX: 0.2, focalY: 0.8, zoom: 1.4,
  });
  assert.equal(firstRemotePhoto.sortIndex, 0);
  assert.ok(remotePhotos.docs.every((photo) => !("blob" in photo.data())));
  assert.deepEqual(firstRemotePhoto.cloud, { state: "localOnly", provider: null, objectKey: null, sha256: null });
  assert.equal(JSON.stringify(remoteCatch.data()).includes("blob"), false);

  const local = await catchRepository.get(catchId, accountScope);
  assert.equal(local.photos[0].blob.size, 3, "Firestore metadata sync must preserve local photo bytes");
  assert.equal(local.sync.photoStatus, "local-only");
  const replay = await firestoreAdapter.write({
    ownerId, entityType: "catch", entityId: catchId, record: local, expectedRevision: null,
    operationId: remoteCatch.data().lastOperationId, localRevision: 1,
  });
  assert.equal(replay.revision, remoteCatch.data().serverRevision, "same operation replay must not create a new revision");

  const changedCatch = await catchRepository.get(catchId, accountScope);
  await catchRepository.put({
    ...changedCatch,
    updatedAt: new Date().toISOString(),
    photos: changedCatch.photos.slice(0, 3).map((photo, index) => index === 0 ? { ...photo, focalX: 0.3 } : photo),
    primaryPhotoId: "photo-2",
    sync: { ...changedCatch.sync, status: "local", revision: changedCatch.sync.revision + 1 },
  }, accountScope);
  const photoMutationSync = await firestoreService.run(ownerId);
  assert.equal(photoMutationSync.status, "success", photoMutationSync.error);
  const updatedRemoteCatch = await getDoc(doc(db, "users", ownerId, "catches", catchId));
  const updatedRemotePhoto = await getDoc(doc(db, "users", ownerId, "catches", catchId, "photos", "photo-1"));
  const removedRemotePhoto = await getDoc(doc(db, "users", ownerId, "catches", catchId, "photos", "photo-4"));
  assert.equal(updatedRemoteCatch.data().primaryPhotoId, "photo-2", "primary selection is synced with the Catch");
  assert.deepEqual(Object.keys(updatedRemoteCatch.data().photoRefs), Array.from({ length: 3 }, (_, index) => `photo-${index + 1}`));
  assert.equal(updatedRemotePhoto.data().focalX, 0.3, "per-photo crop changes are synced to the photo document");
  assert.equal(removedRemotePhoto.data().deleted, true, "photo removal leaves a durable child tombstone");

  const latestLocalForValidation = await catchRepository.get(catchId, accountScope);
  await assert.rejects(() => firestoreAdapter.write({
    ownerId, entityType: "catch", entityId: catchId,
    record: { ...latestLocalForValidation, coordinates: { latitude: 91, longitude: 14.421 } },
    expectedRevision: updatedRemoteCatch.data().serverRevision,
    operationId: `invalid-coordinates-${crypto.randomUUID()}`, localRevision: 2,
  }), /nepodařilo|oprávnění|permission/i, "out-of-range coordinates must be rejected by Firestore rules");

  await assert.rejects(() => firestoreAdapter.write({
    ownerId, entityType: "catch", entityId: catchId,
    record: { ...latestLocalForValidation, photos: [{ ...latestLocalForValidation.photos[0], focalX: 1.1, focalY: 0.5, zoom: 1 }] },
    expectedRevision: updatedRemoteCatch.data().serverRevision,
    operationId: `invalid-frame-${crypto.randomUUID()}`, localRevision: 2,
  }), /nepodařilo|oprávnění|permission/i, "out-of-range framing must be rejected by Firestore rules");

  const legacyCatchId = `legacy-frame-${crypto.randomUUID()}`;
  const legacyCatch = {
    ...local,
    id: legacyCatchId,
    photos: [{ id: "legacy-photo", name: "legacy.jpg", type: "image/jpeg", size: 3 }],
  };
  const legacyWrite = await firestoreAdapter.write({
    ownerId, entityType: "catch", entityId: legacyCatchId, record: legacyCatch,
    expectedRevision: null, operationId: `legacy-frame-${crypto.randomUUID()}`, localRevision: 1,
  });
  assert.equal(legacyWrite.revision, 1, "legacy photo metadata without framing must remain valid");

  const embeddedCatchId = `legacy-embedded-${crypto.randomUUID()}`;
  const embeddedPhotos = Array.from({ length: 6 }, (_, index) => ({
    id: `legacy-${index + 1}`, name: `legacy-${index + 1}.jpg`, type: "image/jpeg", size: 3,
    cloud: { state: "synced", provider: "cloudinary",
      objectKey: `users/${ownerId}/catches/${embeddedCatchId}/photos/legacy-${index + 1}/original`,
      sha256: "a".repeat(64) },
  }));
  const embeddedRemote = { ...remoteCatch.data(), id: embeddedCatchId, photos: embeddedPhotos,
    primaryPhotoId: embeddedPhotos[0].id, serverRevision: 1 };
  delete embeddedRemote.photoRefs;
  await adminDb.doc(`users/${ownerId}/catches/${embeddedCatchId}`).set(embeddedRemote);
  const embeddedDelete = await firestoreAdapter.delete({ ownerId, entityType: "catch", entityId: embeddedCatchId,
    expectedRevision: 1, operationId: `legacy-delete-${crypto.randomUUID()}`, localRevision: 2 });
  assert.equal(embeddedDelete.revision, 2);
  const legacyTombstones = await getDocs(collection(db, "users", ownerId, "catches", embeddedCatchId, "photos"));
  assert.equal(legacyTombstones.size, 6, "legacy Catch with more than four embedded photos must create six child tombstones");
  assert.ok(legacyTombstones.docs.every((photo) => photo.data().deleted === true));
  assert.deepEqual(new Set(legacyTombstones.docs.map((photo) => photo.data().cloud?.objectKey)),
    new Set(embeddedPhotos.map((photo) => photo.cloud.objectKey)));
  const deletionService = createCloudinaryPhotoDeletionService({ db: adminDb, Timestamp: AdminTimestamp,
    getCloudinary: async () => ({ uploader: { destroy: async () => ({ result: "not found" }) } }),
    derivePublicId: (owner, catchKey, photoKey) => `chytnucz/users/${owner}/catches/${catchKey}/photos/${photoKey}/original`,
  });
  await deletionService.enqueueFromTombstones();
  const ownerJobs = await adminDb.collection(`users/${ownerId}/photoDeletionJobs`).get();
  assert.equal(ownerJobs.docs.filter((job) => job.data().catchId === embeddedCatchId).length, 6,
    "legacy tombstones must feed the same server deletion queue");

  assert.deepEqual(
    toRemoteRecord("catch", { ...local, conditionSources: { airTempC: "fabricated" } }, ownerId).conditionSources,
    {},
    "invalid automatic/manual condition provenance must be removed before a remote write",
  );

  const latestLocalCatch = await catchRepository.get(catchId, accountScope);
  await firestoreAdapter.write({
    ownerId, entityType: "catch", entityId: catchId,
    record: { ...latestLocalCatch, notes: "změna z druhého zařízení" }, expectedRevision: updatedRemoteCatch.data().serverRevision,
    operationId: `other-device-${crypto.randomUUID()}`, localRevision: 1,
  });
  const pulled = await firestoreService.run(ownerId);
  assert.equal(pulled.status, "success", pulled.error);
  assert.equal((await catchRepository.get(catchId, accountScope)).notes, "změna z druhého zařízení");
  assert.deepEqual((await catchRepository.get(catchId, accountScope)).coordinates, { latitude: 50.087, longitude: 14.421 });
  assert.equal((await catchRepository.get(catchId, accountScope)).photos[0].blob.size, 3, "remote metadata update must preserve the local Blob");

  const repeated = await firestoreService.run(ownerId);
  assert.equal(repeated.status, "success", repeated.error);

  // Exercise deletion as a durable tombstone, not a Firestore document delete.
  await catchRepository.delete(catchId, accountScope);
  const deleted = await firestoreService.run(ownerId);
  assert.equal(deleted.status, "success", deleted.error);
  const tombstone = await getDoc(doc(db, "users", ownerId, "catches", catchId));
  assert.equal(tombstone.data().deleted, true);
  const deletedPhotoDocs = await getDocs(collection(db, "users", ownerId, "catches", catchId, "photos"));
  assert.ok(deletedPhotoDocs.docs.every((photo) => photo.data().deleted), "deleting Catch tombstones all of its photo documents");
  assert.equal((await outboxRepository.list()).length, 0);

  await waterRepository.delete(waterId, accountScope);
  await firestoreService.run(ownerId);
  assert.equal((await getDoc(doc(db, "users", ownerId, "waters", waterId))).data().deleted, true);

  console.log("Firestore sync emulator passed: authenticated Trip/Catch/Water writes, four-photo new Catch limit, separately validated ordered photo documents, crop/primary/photo-delete synchronization, retained local Blob, exact operation replay, remote delta pull, idempotent resync, Catch/photo tombstones, and clean outbox.");
} finally {
  await deleteAdminApp(adminApp);
  await deleteApp(app);
}
