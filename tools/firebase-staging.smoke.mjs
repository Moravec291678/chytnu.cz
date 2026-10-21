import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import { catchRepository, outboxRepository } from "../src/features/catches/data/catchRepository.js";
import { createFirestoreSyncAdapter } from "../src/features/sync/data/firestoreSyncAdapter.js";
import { createSyncPort } from "../src/features/sync/data/syncPort.js";
import { createSyncService } from "../src/features/sync/data/syncService.js";
import { tripRepository } from "../src/features/trips/data/tripRepository.js";
import { waterRepository } from "../src/features/waters/data/waterRepository.js";

const expectedProject = "chutnucz";
const config = JSON.parse(process.env.CHYTNUCZ_FIREBASE_CONFIG_JSON ?? "null");
if (!config || config.projectId !== expectedProject || process.env.CHYTNUCZ_STAGING_PROJECT !== expectedProject) {
  throw new Error("Real staging smoke test requires an explicit chutnucz Firebase web configuration.");
}

const runId = crypto.randomUUID();
const password = `Staging-${crypto.randomUUID()}-9a!`;
const emailA = `qa-staging-a-${runId}@example.test`;
const emailB = `qa-staging-b-${runId}@example.test`;
const appA = initializeApp(config, `staging-a-${runId}`);
const appB = initializeApp(config, `staging-b-${runId}`);
const appAnonymous = initializeApp(config, `staging-anonymous-${runId}`);
const authA = initializeAuth(appA, { persistence: inMemoryPersistence });
const authB = initializeAuth(appB, { persistence: inMemoryPersistence });
const dbA = getFirestore(appA);
const dbB = getFirestore(appB);
const dbAnonymous = getFirestore(appAnonymous);
let userA = null;
let userB = null;

function operationId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function serviceFor(adapter, auth) {
  return createSyncService({ port: createSyncPort(adapter), getCurrentOwnerId: () => auth.currentUser?.uid ?? null });
}

async function expectDenied(work, label) {
  try {
    await work();
  } catch (error) {
    const code = String(error?.code ?? error?.cause?.code ?? "");
    assert.match(code, /permission-denied|unauthenticated/, `${label}: unexpected error ${code}`);
    return;
  }
  assert.fail(`${label}: operation unexpectedly succeeded`);
}

function makeTrip(id, ownerId, stamp) {
  return {
    schemaVersion: 1, id, ownerId, title: "Real staging QA", locationName: "Testovací revír",
    methodKey: null, createdAt: stamp, updatedAt: stamp, startedAt: stamp, endedAt: stamp,
    sync: { status: "local", revision: 1 },
  };
}

function makeWater(id, ownerId, stamp) {
  return {
    schemaVersion: 1, id, ownerId, name: "Real staging QA revír", waterNumber: null, type: "Řeka",
    area: null, coordinates: { latitude: 50.087, longitude: 14.421 }, notes: "synthetic staging data",
    targetFish: ["Kapr"], isFavorite: false, moderationStatus: "pending", createdAt: stamp,
    updatedAt: stamp, sync: { status: "local", revision: 1 },
  };
}

function makeCatch(id, ownerId, tripId, stamp, photos = []) {
  return {
    schemaVersion: 1, id, ownerId, createdAt: stamp, updatedAt: stamp, caughtAt: stamp,
    species: "Kapr", speciesKey: "carp", speciesLatin: null, weightKg: null, lengthCm: 72,
    girthCm: null, fightMinutes: null, locationName: "Testovací revír", waterNumber: null,
    gpsLocation: "50.087, 14.421", coordinates: { latitude: 50.087, longitude: 14.421 },
    conditions: null, conditionSources: null, waterDepthM: null, bottomType: null, tripId,
    method: null, baits: [], result: "released", photos, notes: "synthetic staging data",
    isFavorite: false, privacy: {
      visibility: "private", photoVisibility: "private", locationPrecision: "none",
      privateSpot: true, nearbyEligible: false, heatmapEligible: false,
    },
    sync: { status: "local", revision: 1 },
  };
}

try {
  ({ user: userA } = await createUserWithEmailAndPassword(authA, emailA, password));
  ({ user: userB } = await createUserWithEmailAndPassword(authB, emailB, password));
  console.log(`STAGING_SMOKE_UIDS=${JSON.stringify([userA.uid, userB.uid])}`);

  const uidA = userA.uid;
  const uidB = userB.uid;
  const authStateRestored = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Auth state callback timed out.")), 10_000);
    const unsubscribe = onAuthStateChanged(authA, (user) => {
      if (user?.uid !== uidA) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    }, reject);
  });
  await authStateRestored;
  await signOut(authA);
  assert.equal(authA.currentUser, null, "logout must clear the current Auth user");
  const login = await signInWithEmailAndPassword(authA, emailA, password);
  assert.equal(login.user.uid, uidA, "email login must restore the same account");

  const scopeA = { scopeKey: `account:${uidA}`, ownerId: uidA };
  const adapterA = createFirestoreSyncAdapter({ db: dbA, getCurrentUserId: () => authA.currentUser?.uid ?? null });
  const adapterB = createFirestoreSyncAdapter({ db: dbB, getCurrentUserId: () => authB.currentUser?.uid ?? null });
  const syncA = serviceFor(adapterA, authA);
  const stamp = new Date().toISOString();
  const tripId = `trip-${runId}`;
  const waterId = `water-${runId}`;
  const catchId = `catch-${runId}`;
  const legacyCatchId = `legacy-${runId}`;
  const tripA = makeTrip(tripId, uidA, stamp);
  const waterA = makeWater(waterId, uidA, stamp);
  const photoBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  const catchA = makeCatch(catchId, uidA, tripId, stamp, [{
    id: "photo-1", name: "qa.jpg", type: "image/jpeg", blob: photoBlob,
    focalX: 0.25, focalY: 0.75, zoom: 1.5,
  }]);

  await tripRepository.start(tripA, scopeA);
  await waterRepository.put(waterA, scopeA);
  await catchRepository.put(catchA, scopeA);
  assert.equal((await outboxRepository.list()).length, 3, "three real staging changes must be queued");
  const firstSync = await syncA.run(uidA);
  assert.equal(firstSync.status, "success", firstSync.error);
  assert.equal(firstSync.sent, 3);
  assert.equal((await outboxRepository.list()).length, 0, "real staging outbox must be clean after ACK");

  const remoteTripRef = doc(dbA, "users", uidA, "trips", tripId);
  const remoteWaterRef = doc(dbA, "users", uidA, "waters", waterId);
  const remoteCatchRef = doc(dbA, "users", uidA, "catches", catchId);
  assert.equal((await getDoc(remoteTripRef)).data().title, tripA.title);
  assert.equal((await getDoc(remoteWaterRef)).data().name, waterA.name);
  const remoteCatch = await getDoc(remoteCatchRef);
  assert.deepEqual(remoteCatch.data().photos, [{
    id: "photo-1", name: "qa.jpg", type: "image/jpeg", size: 3,
    focalX: 0.25, focalY: 0.75, zoom: 1.5,
  }]);

  const localCatch = await catchRepository.get(catchId, scopeA);
  assert.equal(localCatch.photos[0].blob.size, 3, "local photo bytes must survive real metadata sync");
  const replayId = operationId("replay");
  const replayRecord = makeCatch(legacyCatchId, uidA, null, stamp, [{
    id: "legacy-photo", name: "legacy.jpg", type: "image/jpeg", size: 3,
  }]);
  const firstReplay = await adapterA.write({
    ownerId: uidA, entityType: "catch", entityId: legacyCatchId, record: replayRecord,
    expectedRevision: null, operationId: replayId, localRevision: 1,
  });
  const repeatedReplay = await adapterA.write({
    ownerId: uidA, entityType: "catch", entityId: legacyCatchId, record: replayRecord,
    expectedRevision: null, operationId: replayId, localRevision: 1,
  });
  assert.equal(repeatedReplay.revision, firstReplay.revision, "replayed operation must be idempotent");

  await assert.rejects(() => adapterA.write({
    ownerId: uidA, entityType: "catch", entityId: catchId,
    record: { ...localCatch, photos: [{ ...localCatch.photos[0], focalX: 1.1 }] },
    expectedRevision: remoteCatch.data().serverRevision, operationId: operationId("invalid-frame"), localRevision: 2,
  }), /oprávnění|permission/i);

  const updatedCatch = await catchRepository.put({ ...localCatch, notes: "updated on real staging" }, scopeA);
  const localTrip = await tripRepository.get(tripId, scopeA);
  await tripRepository.put({ ...localTrip, title: "Real staging QA updated" }, scopeA);
  const localWater = await waterRepository.get(waterId, scopeA);
  await waterRepository.put({ ...localWater, isFavorite: true }, scopeA);
  const updateSync = await syncA.run(uidA);
  assert.equal(updateSync.status, "success", updateSync.error);
  assert.equal((await getDoc(remoteCatchRef)).data().notes, "updated on real staging");
  assert.equal((await getDoc(remoteTripRef)).data().title, "Real staging QA updated");
  assert.equal((await getDoc(remoteWaterRef)).data().isFavorite, true);

  await assert.rejects(() => adapterA.write({
    ownerId: uidA, entityType: "catch", entityId: catchId, record: updatedCatch,
    expectedRevision: 1, operationId: operationId("stale"), localRevision: 3,
  }), /změnil|conflict/i, "stale revision must produce a conflict");

  const tripBId = `trip-b-${runId}`;
  await adapterB.write({
    ownerId: uidB, entityType: "trip", entityId: tripBId, record: makeTrip(tripBId, uidB, stamp),
    expectedRevision: null, operationId: operationId("b-trip"), localRevision: 1,
  });
  await expectDenied(() => getDoc(doc(dbA, "users", uidB, "trips", tripBId)), "A reads B");
  await expectDenied(() => getDoc(doc(dbB, "users", uidA, "trips", tripId)), "B reads A");
  await expectDenied(() => setDoc(doc(dbA, "users", uidB, "trips", tripBId), { title: "spoof" }, { merge: true }), "A writes B");
  await expectDenied(() => setDoc(doc(dbB, "users", uidA, "trips", tripId), { title: "spoof" }, { merge: true }), "B writes A");
  await expectDenied(() => setDoc(remoteCatchRef, { ownerId: uidB }, { merge: true }), "owner spoof");
  await expectDenied(() => getDoc(doc(dbAnonymous, "users", uidA, "catches", catchId)), "unauthenticated read");
  await expectDenied(() => setDoc(doc(dbAnonymous, "users", uidA, "catches", "anonymous"), { ownerId: uidA }), "unauthenticated write");
  await expectDenied(() => setDoc(doc(dbA, "users", uidA, "unknown", "unknown"), { ownerId: uidA }), "unknown collection");
  await expectDenied(() => setDoc(doc(dbA, "users", uidA, "catches", `malformed-${runId}`), { ownerId: uidA, id: `malformed-${runId}` }), "malformed Catch");
  await expectDenied(() => setDoc(doc(dbA, "users", uidA, "trips", `malformed-${runId}`), { ownerId: uidA, id: `malformed-${runId}` }), "malformed Trip");
  await expectDenied(() => setDoc(doc(dbA, "users", uidA, "waters", `malformed-${runId}`), { ownerId: uidA, id: `malformed-${runId}` }), "malformed Water");

  assert.ok((await getDocs(collection(dbA, "users", uidA, "syncOperations"))).size >= 5);
  assert.ok((await getDocs(collection(dbA, "users", uidA, "syncChanges"))).size >= 5);

  await catchRepository.delete(catchId, scopeA);
  await waterRepository.delete(waterId, scopeA);
  await tripRepository.delete(tripId, scopeA);
  const deleteSync = await syncA.run(uidA);
  assert.equal(deleteSync.status, "success", deleteSync.error);
  assert.equal((await getDoc(remoteCatchRef)).data().deleted, true);
  assert.equal((await getDoc(remoteTripRef)).data().deleted, true);
  assert.equal((await getDoc(remoteWaterRef)).data().deleted, true);
  assert.equal((await outboxRepository.list()).length, 0);

  console.log("REAL_STAGING_SMOKE_PASS auth=register,logout,login,state sync=catch,trip,water,outbox,idempotency,conflict security=unauthenticated,cross-account,malformed,unknown");
} finally {
  for (const entry of [{ auth: authA, user: userA }, { auth: authB, user: userB }]) {
    try {
      if (entry.user && entry.auth.currentUser?.uid !== entry.user.uid) {
        await signInWithEmailAndPassword(entry.auth, entry.user.email, password);
      }
      if (entry.auth.currentUser?.uid === entry.user?.uid) await deleteUser(entry.auth.currentUser);
    } catch (error) {
      console.error(`SYNTHETIC_AUTH_CLEANUP_FAILED ${entry.user?.uid ?? "unknown"} ${error?.code ?? "unknown"}`);
    }
  }
  await Promise.allSettled([deleteApp(appA), deleteApp(appB), deleteApp(appAnonymous)]);
}
