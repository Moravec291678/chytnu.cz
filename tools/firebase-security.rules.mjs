import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const projectId = "demo-chytnucz-local";
const catchPath = (userId, catchId) => `users/${userId}/catches/${catchId}`;
const photoPath = (userId, catchId, photoId) => `${catchPath(userId, catchId)}/photos/${photoId}`;
const tripPath = (userId, tripId) => `users/${userId}/trips/${tripId}`;

function makeTrip(id, ownerId) {
  return {
    schemaVersion: 1,
    id,
    ownerId,
    title: "Ranní výprava",
    locationName: "Labe",
    methodKey: "feeder",
    createdAt: "2026-10-17T06:00:00.000Z",
    updatedAt: "2026-10-17T06:00:00.000Z",
    startedAt: "2026-10-17T06:00:00.000Z",
    endedAt: null,
    deleted: false,
  };
}

function makeSyncedCatch(id, ownerId, tripId = null) {
  return {
    ...makeCatch(id, ownerId, tripId),
    entityType: "catch",
    deleted: false,
    deletedAt: null,
    serverRevision: 1,
    syncSequence: 1,
    lastOperationId: `create-${id}`,
    clientLocalRevision: 1,
    operationDigest: "1".repeat(64),
    lastReceiptId: `receipt-${id}`,
    photoState: "none",
  };
}

function nextSyncedCatch(current, changes = {}) {
  const revision = current.serverRevision + 1;
  const photoRefs = changes.photoRefs ?? current.photoRefs;
  return {
    ...current,
    ...changes,
    photoRefs,
    primaryPhotoId: changes.primaryPhotoId !== undefined ? changes.primaryPhotoId : current.primaryPhotoId,
    photoState: Object.keys(photoRefs).length ? "metadata-only" : "none",
    updatedAt: `2026-10-17T0${revision}:00:00.000Z`,
    serverRevision: revision,
    syncSequence: current.syncSequence + 1,
    lastOperationId: `update-${current.id}-${revision}`,
    clientLocalRevision: current.clientLocalRevision + 1,
    operationDigest: String(revision).repeat(64),
    lastReceiptId: `receipt-${current.id}-${revision}`,
  };
}

function makePhoto(id, ownerId, catchId, changes = {}) {
  return {
    id,
    name: `${id}.jpg`,
    type: "image/jpeg",
    size: 20,
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    sortIndex: 0,
    deleted: false,
    deletedAt: null,
    cloud: { state: "localOnly", provider: null, objectKey: null, sha256: null },
    ...changes,
  };
}

function makeCatch(id, ownerId, tripId = null) {
  return {
    schemaVersion: 1,
    id,
    ownerId,
    createdAt: "2026-10-17T06:00:00.000Z",
    updatedAt: "2026-10-17T06:00:00.000Z",
    caughtAt: "2026-10-17T06:00:00.000Z",
    species: "Kapr obecný",
    speciesKey: "carp",
    speciesLatin: "Cyprinus carpio",
    weightKg: null,
    lengthCm: 72,
    girthCm: null,
    fightMinutes: null,
    locationName: "Labe",
    waterNumber: null,
    gpsLocation: "50.0000, 14.0000",
    coordinates: { latitude: 50, longitude: 14 },
    waterDepthM: null,
    bottomType: null,
    tripId,
    method: { key: "feeder", label: "Feeder", isCustom: false },
    baits: [],
    result: "released",
    photoRefs: {},
    primaryPhotoId: null,
    notes: "Soukromá poznámka",
    isFavorite: false,
    privacy: {
      visibility: "private", photoVisibility: "private", locationPrecision: "none",
      privateSpot: true, nearbyEligible: false, heatmapEligible: false,
    },
  };
}

let testEnv;
let alice;
let bob;
let anonymous;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
  alice = testEnv.authenticatedContext("angler-a");
  bob = testEnv.authenticatedContext("angler-b");
  anonymous = testEnv.unauthenticatedContext();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, tripPath("angler-a", "trip-a")), makeTrip("trip-a", "angler-a"));
    await setDoc(doc(db, tripPath("angler-b", "trip-b")), makeTrip("trip-b", "angler-b"));
    await setDoc(doc(db, catchPath("angler-a", "catch-a")), makeSyncedCatch("catch-a", "angler-a", "trip-a"));
    await setDoc(doc(db, catchPath("angler-b", "catch-b")), makeSyncedCatch("catch-b", "angler-b", "trip-b"));
    await setDoc(doc(db, photoPath("angler-a", "catch-a", "seed-photo")), makePhoto("seed-photo", "angler-a", "catch-a"));
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test("nepřihlášený uživatel nemůže číst, zapisovat ani mazat soukromý úlovek a výpravu", async () => {
  const db = anonymous.firestore();
  await assertFails(getDoc(doc(db, catchPath("angler-a", "catch-a"))));
  await assertFails(getDoc(doc(db, photoPath("angler-a", "catch-a", "seed-photo"))));
  await assertFails(getDocs(collection(db, "users/angler-a/catches")));
  await assertFails(setDoc(doc(db, catchPath("angler-a", "catch-new")), makeCatch("catch-new", "angler-a")));
  await assertFails(updateDoc(doc(db, catchPath("angler-a", "catch-a")), { notes: "nepovolená změna" }));
  await assertFails(deleteDoc(doc(db, catchPath("angler-a", "catch-a"))));
  await assertFails(getDoc(doc(db, tripPath("angler-a", "trip-a"))));
  await assertFails(setDoc(doc(db, tripPath("angler-a", "trip-new")), makeTrip("trip-new", "angler-a")));
  await assertFails(deleteDoc(doc(db, tripPath("angler-a", "trip-a"))));
});

test("vlastník čte své záznamy; zápis vyžaduje synchronizační protokol a přímé mazání je zakázáno", async () => {
  const db = alice.firestore();
  const catchRef = doc(db, catchPath("angler-a", "catch-a"));
  const tripRef = doc(db, tripPath("angler-a", "trip-a"));
  await assertFails(setDoc(doc(db, catchPath("angler-a", "catch-new")), makeCatch("catch-new", "angler-a")));
  await assertFails(setDoc(doc(db, tripPath("angler-a", "trip-new")), makeTrip("trip-new", "angler-a")));
  assert.equal((await assertSucceeds(getDocs(collection(db, "users/angler-a/catches")))).size, 1);
  await assertSucceeds(getDoc(catchRef));
  await assertSucceeds(getDoc(tripRef));
  await assertFails(updateDoc(catchRef, {
    notes: "Upravená soukromá poznámka",
    updatedAt: "2026-10-17T07:00:00.000Z",
  }));
  await assertFails(updateDoc(tripRef, {
    title: "Odpolední výprava",
    updatedAt: "2026-10-17T07:00:00.000Z",
  }));
  await assertFails(deleteDoc(catchRef));
  await assertFails(deleteDoc(tripRef));
});

test("uživatel A nemůže číst, měnit ani mazat záznamy uživatele B", async () => {
  const db = alice.firestore();
  const foreignCatch = doc(db, catchPath("angler-b", "catch-b"));
  const foreignTrip = doc(db, tripPath("angler-b", "trip-b"));
  await assertFails(getDocs(collection(db, "users/angler-b/catches")));
  await assertFails(getDoc(foreignCatch));
  await assertFails(updateDoc(foreignCatch, { notes: "cizí zápis" }));
  await assertFails(deleteDoc(foreignCatch));
  await assertFails(getDoc(foreignTrip));
  await assertFails(updateDoc(foreignTrip, { title: "cizí výprava" }));
  await assertFails(deleteDoc(foreignTrip));
});

test("pravidla odmítnou převzetí vlastníka, změnu chráněných polí i neznámá pole", async () => {
  const db = alice.firestore();
  const catchRef = doc(db, catchPath("angler-a", "catch-a"));
  const tripRef = doc(db, tripPath("angler-a", "trip-a"));
  await assertFails(updateDoc(catchRef, { ownerId: "angler-b" }));
  await assertFails(updateDoc(catchRef, { id: "catch-b" }));
  await assertFails(updateDoc(catchRef, { createdAt: "2020-01-01T00:00:00.000Z" }));
  await assertFails(updateDoc(catchRef, { public: true }));
  await assertFails(updateDoc(tripRef, { ownerId: "angler-b" }));
  await assertFails(updateDoc(tripRef, { startedAt: "2020-01-01T00:00:00.000Z" }));
  await assertFails(setDoc(doc(db, catchPath("angler-a", "spoofed")), makeCatch("spoofed", "angler-b")));
  await assertFails(setDoc(doc(db, "users/angler-a/profiles/profile-a"), { ownerId: "angler-a" }));
});

test("úlovek nemůže obejít validaci polí ani odkazovat na neexistující výpravu", async () => {
  const db = alice.firestore();
  const catchRef = doc(db, catchPath("angler-a", "catch-a"));
  await assertFails(updateDoc(catchRef, { weightKg: -1 }));
  await assertFails(updateDoc(catchRef, { weightSource: "guessed" }));
  await assertFails(updateDoc(catchRef, { waterId: 42 }));
  await assertFails(updateDoc(catchRef, { photos: [{ id: "p1", name: "x.jpg", type: "image/jpeg", size: 20, blob: "data" }] }));
  await assertFails(updateDoc(catchRef, { photoRefs: { missing: true }, primaryPhotoId: "missing", photoState: "metadata-only" }));
  await assertFails(updateDoc(catchRef, { tripId: "trip-does-not-exist" }));
  await assertFails(updateDoc(catchRef, { tripId: null }));
});

test("vlastní metadata fotky lze atomicky vytvořit, číst, upravit ořez a tombstonovat", async () => {
  const db = alice.firestore();
  const catchRef = doc(db, catchPath("angler-a", "catch-a"));
  const photoRef = doc(db, photoPath("angler-a", "catch-a", "photo-1"));
  const initialCatch = (await getDoc(catchRef)).data();
  const create = writeBatch(db);
  create.update(catchRef, nextSyncedCatch(initialCatch, { photoRefs: { "photo-1": true }, primaryPhotoId: "photo-1" }));
  create.set(photoRef, makePhoto("photo-1", "angler-a", "catch-a"));
  await assertSucceeds(create.commit());
  assert.equal((await assertSucceeds(getDoc(photoRef))).data().id, "photo-1");
  assert.equal((await assertSucceeds(getDocs(collection(db, `${catchPath("angler-a", "catch-a")}/photos`)))).size, 2);

  const currentCatch = (await getDoc(catchRef)).data();
  const currentPhoto = (await getDoc(photoRef)).data();
  const crop = writeBatch(db);
  crop.update(catchRef, nextSyncedCatch(currentCatch));
  crop.update(photoRef, { ...currentPhoto, focalX: 0.25, focalY: 0.75, zoom: 1.5 });
  await assertSucceeds(crop.commit());
  assert.equal((await getDoc(photoRef)).data().focalX, 0.25);

  const framedCatch = (await getDoc(catchRef)).data();
  const framedPhoto = (await getDoc(photoRef)).data();
  const cloudMetadata = writeBatch(db);
  cloudMetadata.update(catchRef, nextSyncedCatch(framedCatch));
  cloudMetadata.update(photoRef, {
    ...framedPhoto,
    cloud: {
      state: "synced", provider: "fake",
      objectKey: "users/angler-a/catches/catch-a/photos/photo-1/original",
      sha256: "a".repeat(64),
    },
  });
  await assertSucceeds(cloudMetadata.commit());

  const cropCatch = (await getDoc(catchRef)).data();
  const croppedPhoto = (await getDoc(photoRef)).data();
  const remove = writeBatch(db);
  remove.update(catchRef, nextSyncedCatch(cropCatch, { photoRefs: {}, primaryPhotoId: null }));
  remove.update(photoRef, { ...croppedPhoto, deleted: true, deletedAt: "2026-10-17T09:00:00.000Z" });
  await assertSucceeds(remove.commit());
  assert.equal((await getDoc(photoRef)).data().deleted, true);
  const resurrect = writeBatch(db);
  const deletedCatch = (await getDoc(catchRef)).data();
  resurrect.update(catchRef, nextSyncedCatch(deletedCatch, { photoRefs: { "photo-1": true }, primaryPhotoId: "photo-1" }));
  resurrect.update(photoRef, { ...(await getDoc(photoRef)).data(), deleted: false, deletedAt: null });
  await assertFails(resurrect.commit(), "tombstoned photo IDs cannot be resurrected");
});

test("pravidla bezpečně validují každou fotku a odmítnou neplatná metadata", async () => {
  const db = alice.firestore();
  const catchRef = doc(db, catchPath("angler-a", "catch-a"));
  const invalidPhotos = [
    { ownerId: "angler-b" },
    { catchId: "catch-b" },
    { id: "other-id" },
    { type: "image/gif" },
    { size: 10485761 },
    { focalX: -0.01 },
    { focalY: 1.01 },
    { zoom: 2.01 },
    { cloud: { state: "synced", provider: "fake", objectKey: "users/other/catches/catch-a/photos/invalid-8/original", sha256: "a".repeat(64) } },
    { cloud: { state: "synced", provider: "fake", objectKey: "users/angler-a/catches/catch-a/photos/invalid-9/original", sha256: "bad" } },
    { cloud: { state: "synced", provider: "fake", objectKey: "users/angler-a/catches/catch-a/photos/invalid-10/original", sha256: "a".repeat(64), signedUrl: "https://example.test" } },
    { unknownField: true },
  ];
  for (const [index, changes] of invalidPhotos.entries()) {
    const id = `invalid-${index}`;
    const photoRef = doc(db, photoPath("angler-a", "catch-a", id));
    const currentCatch = (await getDoc(catchRef)).data();
    const batch = writeBatch(db);
    batch.update(catchRef, nextSyncedCatch(currentCatch, { photoRefs: { [id]: true }, primaryPhotoId: id }));
    batch.set(photoRef, makePhoto(id, "angler-a", "catch-a", changes));
    await assertFails(batch.commit());
  }

  const currentCatch = (await getDoc(catchRef)).data();
  const badId = "bad photo id";
  const invalidId = writeBatch(db);
  invalidId.update(catchRef, nextSyncedCatch(currentCatch, { photoRefs: { [badId]: true }, primaryPhotoId: badId }));
  invalidId.set(doc(db, photoPath("angler-a", "catch-a", badId)), makePhoto(badId, "angler-a", "catch-a"));
  await assertFails(invalidId.commit());
});

test("limit 10 projde, jedenáctá fotografie a cross-account přístup jsou zakázány", async () => {
  const db = alice.firestore();
  const catchRef = doc(db, catchPath("angler-a", "catch-a"));
  const tenIds = Array.from({ length: 10 }, (_, index) => `photo-${index}`);
  const createTen = writeBatch(db);
  const tenRefs = Object.fromEntries(tenIds.map((id) => [id, true]));
  createTen.update(catchRef, nextSyncedCatch((await getDoc(catchRef)).data(), { photoRefs: tenRefs, primaryPhotoId: tenIds[0] }));
  tenIds.forEach((id, index) => createTen.set(doc(db, photoPath("angler-a", "catch-a", id)), makePhoto(id, "angler-a", "catch-a", { sortIndex: index })));
  await assertSucceeds(createTen.commit());

  const eleven = [...tenIds, "photo-10"];
  const createEleven = writeBatch(db);
  createEleven.update(catchRef, nextSyncedCatch((await getDoc(catchRef)).data(), { photoRefs: Object.fromEntries(eleven.map((id) => [id, true])), primaryPhotoId: tenIds[0] }));
  createEleven.set(doc(db, photoPath("angler-a", "catch-a", "photo-10")), makePhoto("photo-10", "angler-a", "catch-a", { sortIndex: 10 }));
  await assertFails(createEleven.commit());

  const bobDb = bob.firestore();
  await assertFails(getDoc(doc(bobDb, photoPath("angler-a", "catch-a", "photo-0"))));
  await assertFails(updateDoc(doc(bobDb, photoPath("angler-a", "catch-a", "photo-0")), { focalX: 0.2 }));
  await assertFails(deleteDoc(doc(db, photoPath("angler-a", "catch-a", "photo-0"))));
  await assertFails(getDoc(doc(anonymous.firestore(), photoPath("angler-a", "catch-a", "photo-0"))));
});
