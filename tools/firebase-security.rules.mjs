import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-chytnucz-local";
const catchPath = (userId, catchId) => `users/${userId}/catches/${catchId}`;
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
    photos: [],
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
    await setDoc(doc(db, catchPath("angler-a", "catch-a")), makeCatch("catch-a", "angler-a", "trip-a"));
    await setDoc(doc(db, catchPath("angler-b", "catch-b")), makeCatch("catch-b", "angler-b", "trip-b"));
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test("nepřihlášený uživatel nemůže číst, zapisovat ani mazat soukromý úlovek a výpravu", async () => {
  const db = anonymous.firestore();
  await assertFails(getDoc(doc(db, catchPath("angler-a", "catch-a"))));
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
  await assertFails(updateDoc(catchRef, { tripId: "trip-does-not-exist" }));
  await assertFails(updateDoc(catchRef, { tripId: null }));
});
