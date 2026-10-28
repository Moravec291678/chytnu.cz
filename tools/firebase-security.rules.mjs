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
const notificationPath = (userId, notificationId) => `users/${userId}/notifications/${notificationId}`;
const pushSubscriptionPath = (userId, subscriptionId) => `users/${userId}/pushSubscriptions/${subscriptionId}`;
const serverProgressionEventPath = (userId, eventId) => `users/${userId}/serverProgressionEvents/${eventId}`;
const serverProgressionStatePath = (userId, catchId) => `users/${userId}/serverProgressionCatchState/${catchId}`;
const serverProgressionSummaryPath = (userId) => `users/${userId}/serverProgressionState/summary`;

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

test("notification inbox je owner-scoped a vlastní oznámení lze pouze označit jako přečtené", async () => {
  const aliceDb = alice.firestore();
  const notificationRef = doc(aliceDb, notificationPath("angler-a", "notice-1"));
  const notification = {
    id: "notice-1", ownerId: "angler-a", type: "achievement", title: "Nový úspěch",
    body: "Odemkl(a) jsi nový úspěch a získal(a) 30 XP.", createdAt: "2026-10-28T10:00:00.000Z",
    readAt: null, deepLink: "/achievements",
  };
  await assertSucceeds(setDoc(notificationRef, notification));
  assert.equal((await assertSucceeds(getDocs(collection(aliceDb, "users/angler-a/notifications")))).size, 1);
  await assertSucceeds(updateDoc(notificationRef, { readAt: "2026-10-28T10:01:00.000Z" }));
  await assertFails(updateDoc(notificationRef, { title: "Změněný obsah" }));
  await assertFails(updateDoc(notificationRef, { readAt: null }));
  await assertFails(setDoc(doc(aliceDb, notificationPath("angler-a", "external")), {
    ...notification, id: "external", deepLink: "https://example.com",
  }));

  const bobDb = bob.firestore();
  await assertFails(getDoc(doc(bobDb, notificationPath("angler-a", "notice-1"))));
  await assertFails(getDocs(collection(bobDb, "users/angler-a/notifications")));
  await assertFails(setDoc(doc(bobDb, notificationPath("angler-a", "spoofed")), {
    ...notification, id: "spoofed", ownerId: "angler-a",
  }));
});

test("Web Push subscription je owner-scoped a přijímá pouze omezený endpoint a klíče", async () => {
  const aliceDb = alice.firestore();
  const subscriptionRef = doc(aliceDb, pushSubscriptionPath("angler-a", "endpoint-hash"));
  const subscription = {
    ownerId: "angler-a", installationId: "device-a", endpoint: "https://push.example/subscription/123", expirationTime: null,
    keys: { p256dh: "public-key", auth: "auth-secret" }, updatedAt: "2026-10-28T10:00:00.000Z",
  };
  await assertSucceeds(setDoc(subscriptionRef, subscription));
  assert.equal((await assertSucceeds(getDocs(collection(aliceDb, "users/angler-a/pushSubscriptions")))).size, 1);
  await assertSucceeds(deleteDoc(subscriptionRef));
  await assertFails(setDoc(doc(aliceDb, pushSubscriptionPath("angler-a", "bad-endpoint")), { ...subscription, endpoint: "http://push.example/subscription" }));
  await assertFails(setDoc(doc(aliceDb, pushSubscriptionPath("angler-a", "bad-owner")), { ...subscription, ownerId: "angler-b" }));
  await assertFails(getDocs(collection(bob.firestore(), "users/angler-a/pushSubscriptions")));
  await assertFails(setDoc(doc(bob.firestore(), pushSubscriptionPath("angler-a", "spoofed")), subscription));
});

test("server progression shadow ledger je owner-readable a klient jej nemůže falšovat", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, serverProgressionEventPath("angler-a", "catch-created-catch-a")), {
      id: "catch-created-catch-a", ownerId: "angler-a", catchId: "catch-a", type: "catch.created", xp: 10,
    });
    await setDoc(doc(db, serverProgressionStatePath("angler-a", "catch-a")), {
      ownerId: "angler-a", catchId: "catch-a", level: "standard", awardedXp: 10,
    });
    await setDoc(doc(db, serverProgressionSummaryPath("angler-a")), {
      ownerId: "angler-a", legacyBaselineXp: 250,
    });
  });
  const ownEvent = doc(alice.firestore(), serverProgressionEventPath("angler-a", "catch-created-catch-a"));
  const ownState = doc(alice.firestore(), serverProgressionStatePath("angler-a", "catch-a"));
  const ownSummary = doc(alice.firestore(), serverProgressionSummaryPath("angler-a"));
  assert.equal((await assertSucceeds(getDoc(ownEvent))).data().xp, 10);
  assert.equal((await assertSucceeds(getDoc(ownState))).data().level, "standard");
  assert.equal((await assertSucceeds(getDoc(ownSummary))).data().legacyBaselineXp, 250);
  await assertFails(updateDoc(ownSummary, { legacyBaselineXp: 0 }));
  await assertFails(setDoc(doc(alice.firestore(), serverProgressionEventPath("angler-a", "forged")), {
    id: "forged", ownerId: "angler-a", catchId: "catch-a", type: "catch.created", xp: 1000,
  }));
  await assertFails(updateDoc(ownEvent, { xp: 1000 }));
  await assertFails(setDoc(doc(alice.firestore(), serverProgressionStatePath("angler-a", "other-catch")), {
    ownerId: "angler-a", catchId: "other-catch", level: "strong", awardedXp: 1000,
  }));
  await assertFails(getDoc(doc(bob.firestore(), serverProgressionEventPath("angler-a", "catch-created-catch-a"))));
  await assertFails(getDoc(doc(bob.firestore(), serverProgressionStatePath("angler-a", "catch-a"))));
  await assertFails(getDoc(doc(bob.firestore(), serverProgressionSummaryPath("angler-a"))));
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

test("nový Catch má limit čtyř fotek a legacy Catch může počet jen zachovat nebo snížit", async () => {
  const db = alice.firestore();
  const fourIds = Array.from({ length: 4 }, (_, index) => `photo-${index}`);
  const fourCatch = { ...makeSyncedCatch("catch-four", "angler-a"), photoRefs: Object.fromEntries(fourIds.map((id) => [id, true])), primaryPhotoId: fourIds[0], photoState: "metadata-only" };
  const createFour = writeBatch(db);
  createFour.set(doc(db, catchPath("angler-a", "catch-four")), fourCatch);
  fourIds.forEach((id, index) => createFour.set(doc(db, photoPath("angler-a", "catch-four", id)), makePhoto(id, "angler-a", "catch-four", { sortIndex: index })));
  await assertSucceeds(createFour.commit());

  const fiveIds = [...fourIds, "photo-4"];
  const fiveCatch = { ...makeSyncedCatch("catch-five", "angler-a"), photoRefs: Object.fromEntries(fiveIds.map((id) => [id, true])), primaryPhotoId: fiveIds[0], photoState: "metadata-only" };
  const createFive = writeBatch(db);
  createFive.set(doc(db, catchPath("angler-a", "catch-five")), fiveCatch);
  fiveIds.forEach((id, index) => createFive.set(doc(db, photoPath("angler-a", "catch-five", id)), makePhoto(id, "angler-a", "catch-five", { sortIndex: index })));
  await assertFails(createFive.commit());

  const legacyIds = Array.from({ length: 10 }, (_, index) => `legacy-photo-${index}`);
  const legacyRefs = Object.fromEntries(legacyIds.map((id) => [id, true]));
  const legacyCatch = { ...makeSyncedCatch("catch-legacy", "angler-a"), photoRefs: legacyRefs, primaryPhotoId: legacyIds[0], photoState: "metadata-only" };
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const seed = context.firestore();
    await setDoc(doc(seed, catchPath("angler-a", "catch-legacy")), legacyCatch);
    await Promise.all(legacyIds.map((id, index) => setDoc(doc(seed, photoPath("angler-a", "catch-legacy", id)), makePhoto(id, "angler-a", "catch-legacy", { sortIndex: index }))));
  });
  const legacyRef = doc(db, catchPath("angler-a", "catch-legacy"));
  await assertSucceeds(getDoc(legacyRef));
  await assertSucceeds(getDoc(doc(db, photoPath("angler-a", "catch-legacy", legacyIds[9]))));

  const elevenIds = [...legacyIds, "legacy-photo-10"];
  const increase = writeBatch(db);
  increase.update(legacyRef, nextSyncedCatch(legacyCatch, { photoRefs: Object.fromEntries(elevenIds.map((id) => [id, true])) }));
  increase.set(doc(db, photoPath("angler-a", "catch-legacy", "legacy-photo-10")), makePhoto("legacy-photo-10", "angler-a", "catch-legacy"));
  await assertFails(increase.commit());

  const reduceToFive = nextSyncedCatch(legacyCatch, { photoRefs: Object.fromEntries(legacyIds.slice(0, 5).map((id) => [id, true])), primaryPhotoId: legacyIds[0] });
  await assertSucceeds(updateDoc(legacyRef, reduceToFive));
  assert.equal((await getDoc(legacyRef)).data().photoRefs && Object.keys((await getDoc(legacyRef)).data().photoRefs).length, 5);

  const reduceToFour = nextSyncedCatch(reduceToFive, { photoRefs: Object.fromEntries(legacyIds.slice(0, 4).map((id) => [id, true])) });
  await assertSucceeds(updateDoc(legacyRef, reduceToFour));

  const bobDb = bob.firestore();
  await assertFails(getDoc(doc(bobDb, photoPath("angler-a", "catch-legacy", legacyIds[0]))));
  await assertFails(updateDoc(doc(bobDb, photoPath("angler-a", "catch-legacy", legacyIds[0])), { focalX: 0.2 }));
  await assertFails(deleteDoc(doc(db, photoPath("angler-a", "catch-legacy", legacyIds[0]))));
  await assertFails(getDoc(doc(anonymous.firestore(), photoPath("angler-a", "catch-legacy", legacyIds[0]))));
});
