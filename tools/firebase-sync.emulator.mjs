import { openPhotoRenderProbe } from "./photo-render-probe.mjs";
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
import { IDBFactory } from "fake-indexeddb";
import { createPhotoCloudService } from "../src/features/catches/data/photoCloudService.js";
import { createCloudinaryPhotoProvider } from "../src/features/catches/data/cloudinaryPhotoProvider.js";
import { getPhotoAvailability } from "../src/features/catches/data/photoAvailability.js";
import { sha256Blob } from "../src/features/catches/data/photoCloudProvider.js";
import { readSyncSummary } from "../src/features/sync/data/localSyncRepository.js";
import { catchRepository, outboxRepository } from "../src/features/catches/data/catchRepository.js";
import { createCloudinaryPhotoDeletionService } from "../src/server/cloudinaryPhotoDeletion.js";
import { createFirestoreSyncAdapter, toRemoteRecord, subscribeToOwnerSyncChanges } from "../src/features/sync/data/firestoreSyncAdapter.js";
import { createSyncPort } from "../src/features/sync/data/syncPort.js";
import { createSyncService } from "../src/features/sync/data/syncService.js";
import { tripRepository } from "../src/features/trips/data/tripRepository.js";
import { waterRepository } from "../src/features/waters/data/waterRepository.js";
import { createQuickCapture, prepareQuickCatch, persistQuickCatch } from "../src/features/catches/data/quickCatch.js";
import { buildTripCatchMarkers } from "../src/features/map/data/tripCatchMap.js";

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
    methodKey: "feeder", waterId, baitKeys: ["corn"], waterDepthM: 3, bottomType: "gravel",
    waterTemperatureMeasurement: { valueC: 12, measuredAt: stamp, source: "manual_trip" },
    createdAt: stamp, updatedAt: stamp, startedAt: stamp, endedAt: null,
    sync: { status: "local", revision: 1 },
  }, accountScope);
  await waterRepository.put({
    schemaVersion: 1, id: waterId, ownerId, name: "Labe", waterNumber: "411050", type: "Neuvedeno", catalogueId: "ris-0123456789abcdef01234567", area: null,
    coordinates: { latitude: 50.087, longitude: 14.421 }, notes: "emulator water", targetFish: ["Kapr"],
    isFavorite: false, moderationStatus: "pending", createdAt: stamp, updatedAt: stamp, sync: { status: "local", revision: 1 },
  }, accountScope);
  const photoBlob = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgUbL4DwACCgFmeGgpMwAAAABJRU5ErkJggg==", "base64")], { type: "image/png" });
  await catchRepository.put({
    schemaVersion: 1, id: catchId, ownerId, createdAt: stamp, updatedAt: stamp, caughtAt: stamp,
    species: "Kapr", speciesKey: "carp", speciesLatin: null, weightKg: null, lengthCm: null,
    girthCm: null, fightMinutes: null, locationName: "Labe", waterNumber: null, gpsLocation: "50.087, 14.421",
    coordinates: { latitude: 50.087, longitude: 14.421 },
    gpsSource: "manual-map",
    conditions: { airTempC: 11, moonPhase: "full" },
    conditionSources: { airTempC: "auto", moonPhase: "auto" }, environment: { conditions: { humidityPct: 75, precipitationMm: 0 } },
    verification: { status: "unverified", level: "limited", reason: "missing-location", photoHash: null, photoCaptureMetadata: null, locationSource: null, gpsAccuracyMeters: null, verifiedAt: null },
    waterDepthM: null, bottomType: null, tripId, method: null, baits: [], result: "released",
    photos: Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index + 1}`, name: `kapr-${index + 1}.png`, type: photoBlob.type, blob: photoBlob, focalX: 0.2, focalY: 0.8, zoom: 1.4 })),
    notes: "emulator integration fixture", isFavorite: false, sync: { status: "local", revision: 1 },
  }, accountScope);

  const queuedBeforeFirstSync = await outboxRepository.list();
  assert.equal(queuedBeforeFirstSync.length, 3, `Unexpected outbox before first sync: ${JSON.stringify(queuedBeforeFirstSync)}`);
  let stopRealtime;
  let realtimeTimeout;
  const realtimeChange = new Promise((resolve, reject) => {
    realtimeTimeout = setTimeout(() => reject(new Error("Realtime change was not delivered")), 10_000);
    stopRealtime = subscribeToOwnerSyncChanges(ownerId, (sequence) => { if (sequence > 0) resolve(sequence); }, reject,
      { db, getCurrentUserId: () => auth.currentUser?.uid });
  });
  const first = await firestoreService.run(ownerId);
  try { assert.ok(await realtimeChange > 0); }
  finally { clearTimeout(realtimeTimeout); stopRealtime(); }
  assert.equal(first.status, "success", first.error);
  assert.equal(first.sent, 3, `Unexpected first sync result: ${JSON.stringify(first)}; outbox: ${JSON.stringify(await outboxRepository.list())}`);
  assert.equal((await outboxRepository.list()).length, 0);

  const remoteTrip = await getDoc(doc(db, "users", ownerId, "trips", tripId));
  const remoteCatch = await getDoc(doc(db, "users", ownerId, "catches", catchId));
  const remoteWater = await getDoc(doc(db, "users", ownerId, "waters", waterId));
  assert.equal(remoteTrip.data().title, "Testovací výprava");
  assert.equal(remoteTrip.data().waterDepthM, 3); assert.equal(remoteTrip.data().bottomType, "gravel");
  assert.equal(remoteTrip.data().waterTemperatureMeasurement.valueC, 12);
  assert.equal(JSON.parse(remoteCatch.data().environment).conditions.humidityPct, 75);
  assert.equal(remoteCatch.data().tripId, tripId);
  assert.equal(remoteWater.data().name, "Labe");
  assert.equal(remoteWater.data().id, waterId);
  assert.equal(remoteWater.data().catalogueId, "ris-0123456789abcdef01234567");
  assert.equal(remoteWater.data().type, "Neuvedeno");
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
    id: "photo-1", name: "kapr-1.png", type: photoBlob.type, size: photoBlob.size,
    focalX: 0.2, focalY: 0.8, zoom: 1.4,
  });
  assert.equal(firstRemotePhoto.sortIndex, 0);
  assert.ok(remotePhotos.docs.every((photo) => !("blob" in photo.data())));
  assert.deepEqual(firstRemotePhoto.cloud, { state: "localOnly", provider: null, objectKey: null, sha256: null });
  assert.equal(JSON.stringify(remoteCatch.data()).includes("blob"), false);

  const local = await catchRepository.get(catchId, accountScope);
  assert.equal(local.photos[0].blob.size, photoBlob.size, "Firestore metadata sync must preserve local photo bytes");
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
  assert.equal((await catchRepository.get(catchId, accountScope)).photos[0].blob.size, photoBlob.size, "remote metadata update must preserve the local Blob");

  const repeated = await firestoreService.run(ownerId);
  assert.equal(repeated.status, "success", repeated.error);

  const source = await catchRepository.get(catchId, accountScope);
  const beforeReady = await getDoc(doc(db, "users", ownerId, "catches", catchId));
  let baseline;
  let stopReady;
  let readyTimeout;
  let initial;
  const initialSnapshot = new Promise((resolve) => { initial = resolve; });
  const readyEvent = new Promise((resolve, reject) => {
    readyTimeout = setTimeout(() => reject(new Error("Photo READY realtime timed out")), 10_000);
    stopReady = subscribeToOwnerSyncChanges(ownerId, (sequence) => {
      if (baseline === undefined) { baseline = sequence; initial(); }
      else if (sequence > baseline) resolve(performance.now());
    }, reject, { db, getCurrentUserId: () => ownerId });
  });
  await initialSnapshot;
  const hash = await sha256Blob(source.photos[0].blob);
  const renderProbe = await openPhotoRenderProbe(process.env.CHYTNU_TIMING_BROWSER);
  const verifiedAt = performance.now();
  await firestoreAdapter.write({ ownerId, entityType: "catch", entityId: catchId,
    record: { ...source, photos: source.photos.map((photo) => ({ ...photo, cloud: {
      state: "synced", provider: "cloudinary", objectKey: `users/${ownerId}/catches/${catchId}/photos/${photo.id}/original`, sha256: hash,
    } })) }, expectedRevision: beforeReady.data().serverRevision,
    operationId: `ready-${crypto.randomUUID()}`, localRevision: 1 });
  const readyAt = performance.now();
  const realtimeAt = await readyEvent;
  clearTimeout(readyTimeout); stopReady();
  const firstDevice = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  try {
    assert.equal((await serviceFor(firestoreAdapter).run(ownerId)).status, "success");
    const received = await catchRepository.get(catchId, accountScope);
    assert.equal((await waterRepository.get(waterId, accountScope)).catalogueId, "ris-0123456789abcdef01234567");
    assert.equal(received.photos[0].cloud.state, "synced");
    assert.equal(received.photos[0].cloud.sha256, hash);
    const rows = await Promise.all(received.photos.map(async (photo, index) => {
      const injectedDelayMs = [0, 120, 600][index];
      let requestAt;
      const delivery = createPhotoCloudService({ provider: createCloudinaryPhotoProvider(), getCurrentOwnerId: () => ownerId,
        authenticatedRequest: async (path) => {
          assert.equal(path, "/api/cloudinary/export"); requestAt = performance.now();
          await new Promise((resolve) => setTimeout(resolve, injectedDelayMs));
          return new Response(photoBlob, { status: 200, headers: { "Content-Type": photoBlob.type } }).blob();
        } });
      const delivered = await delivery.getPhotoBlob({ photo, ownerId, catchId, scopeKey: accountScope.scopeKey });
      const blobAt = performance.now();
      assert.equal(getPhotoAvailability(photo, { loadState: "ready", resolvedBlob: delivered }), "available");
      const render = await renderProbe?.render(index, delivered);
      if (render) { assert.equal(render.inViewport, true); assert.equal(render.width, 1); assert.equal(render.height, 1); }
      return { sample: index + 1, injectedDelayMs, readyWriteStartToCommitAck: Math.round(readyAt - verifiedAt),
        readyWriteStartToRealtime: Math.round(realtimeAt - verifiedAt), realtimeToDeliveryRequest: Math.round(requestAt - realtimeAt),
        deliveryRequestToVerifiedBlob: Math.round(blobAt - requestAt), browserDecode: render ? Math.round(render.decodeMs) : null,
        decodeToSecondAnimationFrame: render ? Math.round(render.frameMs) : null, verifiedBlobToViewportConfirmation: render ? Math.round(performance.now() - blobAt) : null };
    }));
    assert.equal((await readSyncSummary(ownerId)).pending, 0);
    console.log(JSON.stringify({ syntheticPhotoTimingMs: rows, metadata: "Firestore emulator", delivery: "synthetic delayed endpoint",
      render: renderProbe ? "headless Chromium decode and in-viewport after two animation frames; physical display unmeasured" : "not measured" }));
  } finally { globalThis.indexedDB = firstDevice; await renderProbe?.close(); }
  await firestoreService.run(ownerId);

  // Exercise deletion as a durable tombstone, not a Firestore document delete.
  await catchRepository.delete(catchId, accountScope);
  const deleted = await firestoreService.run(ownerId);
  assert.equal(deleted.status, "success", deleted.error);
  const tombstone = await getDoc(doc(db, "users", ownerId, "catches", catchId));
  assert.equal(tombstone.data().deleted, true);
  const deletedPhotoDocs = await getDocs(collection(db, "users", ownerId, "catches", catchId, "photos"));
  assert.ok(deletedPhotoDocs.docs.every((photo) => photo.data().deleted), "deleting Catch tombstones all of its photo documents");
  const remainingAfterDelete = await outboxRepository.list();
  assert.equal(remainingAfterDelete.length, 3, "each newly cloud-ready photo requires its normal deletion job");
  assert.equal(remainingAfterDelete[0].operation, "photo-delete");

  // Use the actual one-photo creation contract, then exercise its wire metadata
  // and a second isolated IndexedDB device. READY/delivery here are synthetic.
  const quickHash = await sha256Blob(photoBlob);
  const quickCapture = createQuickCapture("camera");
  const quick = await prepareQuickCatch(photoBlob, quickCapture, {
    prepare: async () => ({ blob: photoBlob, type: photoBlob.type, size: photoBlob.size, sha256: quickHash }),
    readMetadata: async () => null, ownerId, trip: await tripRepository.get(tripId, accountScope),
    methods: [{ key: "feeder", label: "Feeder" }], baits: [{ key: "corn", label: "Kukuřice" }],
    waters: [await waterRepository.get(waterId, accountScope)],
    locationEvidence: { coordinates: { latitude: 50.091, longitude: 14.425 }, accuracyMeters: 8, capturedAt: quickCapture.capturedAt, source: "live-gps" },
  });
  await persistQuickCatch(quick, accountScope, catchRepository);
  await persistQuickCatch(quick, accountScope, catchRepository);
  const quickSync = await firestoreService.run(ownerId);
  assert.equal(quickSync.status, "success", JSON.stringify(quickSync));
  const quickRemote = (await getDoc(doc(db, "users", ownerId, "catches", quick.id))).data();
  assert.equal(quickRemote.speciesKey, ""); assert.equal(quickRemote.lengthCm, null); assert.equal(quickRemote.weightKg, null);
  assert.equal(JSON.parse(quickRemote.quickCatch).capturedAt, quick.quickCatch.capturedAt);
  const quickLocal = await catchRepository.get(quick.id, accountScope);
  await firestoreAdapter.write({ ownerId, entityType: "catch", entityId: quick.id,
    record: { ...quickLocal, photos: quickLocal.photos.map(photo => ({ ...photo, cloud: {
      state: "synced", provider: "cloudinary", objectKey: `users/${ownerId}/catches/${quick.id}/photos/${photo.id}/original`, sha256: quickHash,
    } })) }, expectedRevision: quickRemote.serverRevision, operationId: `quick-ready-${crypto.randomUUID()}`, localRevision: 1 });
  const readyQuick = await firestoreAdapter.read({ ownerId, entityType: "catch", entityId: quick.id });
  await firestoreAdapter.write({ ownerId, entityType: "catch", entityId: quick.id,
    record: { ...readyQuick.record, notes: "Updated full-context catch and photo frame", photos: readyQuick.record.photos.map(photo => ({ ...photo, focalX: 0.25 })),
      method: { key: "float", label: "Plavaná", isCustom: false }, waterDepthM: 1,
      conditions: { ...readyQuick.record.conditions, waterTempC: 15 }, conditionSources: { ...readyQuick.record.conditionSources, waterTempC: "manual" },
      quickCatch: { ...readyQuick.record.quickCatch, provenance: { ...readyQuick.record.quickCatch.provenance, method: "manual", waterDepthM: "manual", waterTempC: "manual" } } },
    expectedRevision: readyQuick.revision, operationId: `quick-edited-${crypto.randomUUID()}`, localRevision: 2 });
  const quickOriginDevice = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  try {
    assert.equal((await serviceFor(firestoreAdapter).run(ownerId)).status, "success");
    const received = await catchRepository.get(quick.id, accountScope);
    assert.equal(received.captureMode, "quick");
    assert.equal(received.notes, "Updated full-context catch and photo frame");
    assert.equal(received.quickCatch.provenance.caughtAt, "device");
    assert.equal(received.waterId, waterId); assert.equal(received.waterNumber, 411050);
    assert.equal(received.waterDepthM, 1); assert.equal(received.bottomType, "gravel");
    assert.equal(received.method.key, "float"); assert.equal(received.baits[0].key, "corn");
    assert.equal(received.conditions.waterTempC, 15); assert.equal(received.quickCatch.provenance.waterTempC, "manual");
    assert.deepEqual(received.quickCatch.tripSnapshot, quick.quickCatch.tripSnapshot);
    assert.deepEqual(received.coordinates, quick.coordinates); assert.equal(received.locationEvidence.accuracyMeters, 8);
    const secondTrip = await tripRepository.get(tripId, accountScope);
    const markers = buildTripCatchMarkers([received], secondTrip, accountScope);
    assert.equal(markers.length, 1); assert.equal(markers[0].id, quick.id); assert.equal(markers[0].latitude, 50.091);
    assert.equal(received.photos.length, 1); assert.equal(received.photos[0].cloud.state, "synced");
    const delivery = createPhotoCloudService({ provider: createCloudinaryPhotoProvider(), getCurrentOwnerId: () => ownerId,
      authenticatedRequest: async () => photoBlob });
    const delivered = await delivery.getPhotoBlob({ photo: received.photos[0], ownerId, catchId: quick.id, scopeKey: accountScope.scopeKey });
    assert.equal(await sha256Blob(delivered), quickHash);
  } finally { globalThis.indexedDB = quickOriginDevice; }
  await waterRepository.delete(waterId, accountScope);
  await firestoreService.run(ownerId);
  assert.equal((await getDoc(doc(db, "users", ownerId, "waters", waterId))).data().deleted, true);
  console.log("Quick Catch emulator passed: actual local one-photo creation, retry identity, unknown fields, bounded metadata, synthetic READY and second-device photo delivery.");

  console.log("Firestore sync emulator passed: authenticated Trip/Catch/Water writes, four-photo new Catch limit, separately validated ordered photo documents, crop/primary/photo-delete synchronization, retained local Blob, exact operation replay, remote delta pull, idempotent resync, Catch/photo tombstones, and clean outbox.");
} finally {
  await deleteAdminApp(adminApp);
  await deleteApp(app);
}
