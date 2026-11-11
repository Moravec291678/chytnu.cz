// Only synthetic emulator users and fixtures. Never run against production.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore as getClientFirestore, connectFirestoreEmulator, terminate } from "firebase/firestore";
import { createFirestoreSyncAdapter } from "../src/features/sync/data/firestoreSyncAdapter.js";
import { createPublicProfileService } from "../src/features/social/server/publicProfileService.js";
import { createSocialHandler } from "../src/features/social/server/socialApi.js";
import { createSocialPhotoCoordinator } from "../src/features/social/server/socialPhotoCoordinator.js";
import { createAccountDeletionService } from "../src/server/accountDeletion.js";
import { publicationId } from "../src/features/social/data/publicationModel.js";
import { canonicalPair } from "../src/features/social/data/socialModel.js";
import { moderationKey } from "../src/features/admin/server/adminSupportStore.js";
import catalogue from "../public/data/ris/be90ad549cf77679/index.json" with { type: "json" };

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local Auth/Firestore emulators required");
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `publications-${randomUUID()}`), db = getFirestore(app), auth = getAuth(app);
const suffix = randomUUID().replaceAll("-", "").slice(0, 8), ids = {}, tokens = {};
const clientApp = initializeClientApp({ apiKey: "demo-key", projectId: "demo-chytnucz-local", authDomain: "localhost" }, `publication-client-${suffix}`);
const clientAuth = initializeAuth(clientApp, { persistence: inMemoryPersistence }), clientDb = getClientFirestore(clientApp);
connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(clientDb, "127.0.0.1", 8080);
let checks = 0, time = Date.now(), requests = 0, preparations = 0, deliveries = 0, duringDelivery, lastHeaders;
const env = {}, socialPhoto = {
  async prepare(identity, photo) {
    assert.equal(photo.cloud.objectKey, `users/${identity.uid}/catches/${identity.catchId}/photos/${identity.photoId}/original`); checks++; preparations++;
    return { version: "123", sha256: photo.cloud.sha256, transformationVersion: 1, width: 100, height: 80 };
  },
  async delivery(identity, photo, receipt) {
    assert.equal(photo.cloud.objectKey, `users/${identity.uid}/catches/${identity.catchId}/photos/${identity.photoId}/original`); assert.equal(receipt.sha256, photo.cloud.sha256); checks += 2; deliveries++;
    if (duringDelivery) await duringDelivery();
    return new Uint8Array([255, 216, 255, 217]);
  },
};
const makeHandler = () => createSocialHandler({ service: createPublicProfileService({ db, auth, avatar: {}, socialPhoto, env, now: () => time,
  cursorSecret: "synthetic-publications-cursor-secret-longer-than32" }) });
let handler = makeHandler();
function equal(a, b) { assert.deepEqual(a, b); checks++; }
function safe(value) {
  assert.doesNotMatch(JSON.stringify(value), /SECRET|latitude|longitude|sourceCatchId|sourcePhotoId|objectKey|sha256|mediaReceipt|sourceFingerprint|privateNote/); checks++;
}
async function call(role, action, payload = {}, expected = 200) {
  if (++requests % 20 === 0) time += 60_000;
  const response = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "POST", headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}, body: { action, ...payload } }, response);
  lastHeaders = response.headers;
  assert.equal(response.statusCode, expected, `${role}/${action}: ${JSON.stringify(response.body)}`); checks++; return response.body;
}
const list = async role => (await call(role, "posts.list", { identity: ids.a })).posts;
const basic = { catchId: "catch", photoId: "photo", visibility: "public", description: "Výslovně sdílený úlovek.", fields: {} };
const ref = role => db.doc(`users/${ids[role]}/catches/catch`);
const photoRef = role => ref(role).collection("photos").doc("photo");
const pairRef = () => db.doc(`socialRelationships/${canonicalPair(ids.a, ids.b)}`);
const befriend = () => pairRef().set({ requestedBy: ids.a, memberUids: [ids.a, ids.b], status: "accepted", createdAt: time, updatedAt: time, revision: 1 });
async function direct(role, path, method = "GET", body) {
  return fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/${path}`, {
    method, headers: { ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
try {
  for (const role of ["a", "b", "c", "owner", "co"]) {
    const uid = `publication-${role}-${suffix}`; ids[role] = uid;
    await auth.createUser({ uid, email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!` });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!`, returnSecureToken: true }),
    });
    equal(response.status, 200); tokens[role] = (await response.json()).idToken;
    await call(role, "save", { profile: { handle: `${role}_${suffix}`, displayName: `Synthetic ${role}`, visibility: "public", sections: { gallery: "public", catches: "public" } } });
  }
  env.CHYTNU_OWNER_UID = ids.owner; env.CHYTNU_CO_CREATOR_UID = ids.co; handler = makeHandler();
  const original = { id: "catch", ownerId: ids.a, species: "Kapr", lengthCm: 53, weightKg: 3.2, weightSource: "manual",
    privacy: { visibility: "private", photoVisibility: "private", locationPrecision: "none", privateSpot: true, nearbyEligible: false, heatmapEligible: false }, photoRefs: { photo: true },
    caughtAt: new Date(time).toISOString(), method: { key: "feeder", label: "Feeder", isCustom: false }, waterId: "personal-water", waterName: "SECRET-SPOT",
    coordinates: { latitude: 50.123456, longitude: 14.654321 }, notes: "SECRET-NOTE", deleted: false };
  const originalPhoto = { id: "photo", name: "synthetic.jpg", type: "image/jpeg", size: 5000, deleted: false, deletedAt: null, focalX: 0.5, focalY: 0.5, zoom: 1, sortIndex: 0,
    cloud: { provider: "cloudinary", state: "synced", objectKey: `users/${ids.a}/catches/catch/photos/photo/original`, sha256: "a".repeat(64) } };
  // Real client adapter + Rules, not an Admin-only fixture shape. Photo metadata
  // deliberately has no ownerId; ownership is its private path and parent catch.
  await signInWithEmailAndPassword(clientAuth, `${ids.a}@example.test`, `Synthetic-${suffix}-9!`);
  const adapter = createFirestoreSyncAdapter({ db: clientDb, getCurrentUserId: () => clientAuth.currentUser?.uid ?? null });
  await adapter.write({ ownerId: ids.a, entityType: "catch", entityId: "catch", record: { ...original, photos: [originalPhoto] }, expectedRevision: null, operationId: randomUUID(), localRevision: 1 });
  equal(Object.hasOwn((await photoRef("a").get()).data(), "ownerId"), false);
  equal((await photoRef("a").get()).data(), originalPhoto);
  await db.doc(`users/${ids.a}/waters/personal-water`).set({ ownerId: ids.a, catalogueId: catalogue[0].id, name: "SECRET-CUSTOM-NAME" });
  const privateXp = { totalXp: 9999, notes: "SECRET-LEDGER" };
  await db.doc(`users/${ids.a}/progression/state`).set(privateXp);
  equal((await list("anonymous")).length, 0); // Existing private catches never auto-publish.
  await call("anonymous", "posts.save", basic, 401);
  await call("b", "posts.save", basic, 404);
  await call("a", "posts.save", { ...basic, uid: ids.b }, 400);
  await call("a", "posts.save", { ...basic, fields: { gps: true } }, 400);
  await call("a", "posts.save", { ...basic, description: "x".repeat(1001) }, 400);

  let saved = (await call("a", "posts.save", { ...basic, expectedRevision: 0 })).post;
  const postId = publicationId(ids.a, "catch"), postRef = db.doc(`socialPosts/${postId}`);
  equal(saved.id, postId); equal(saved.revision, 1); equal(preparations, 1);
  let publicPosts = await list("anonymous"); equal(publicPosts.length, 1); safe(publicPosts);
  equal(publicPosts[0].content, { species: "Kapr", description: basic.description });
  const changeGallery = value => call("a", "save", { profile: { handle: `a_${suffix}`, displayName: "Synthetic a", visibility: "public", sections: { gallery: value, catches: "public" } } });
  await changeGallery("private"); equal((await list("anonymous")).length, 0);
  await call("anonymous", "posts.image", { postId }, 404);
  await changeGallery("friends"); equal((await list("anonymous")).length, 0); equal((await list("b")).length, 0);
  await befriend(); equal((await list("b")).length, 1);
  await changeGallery("public"); await pairRef().delete();
  const pageIds = [];
  for (let i = 0; i < 12; i++) {
    const catchId = `page${i}`;
    await db.doc(`users/${ids.a}/catches/${catchId}`).set({ ...original, id: catchId });
    const result = await call("a", "posts.save", { ...basic, catchId, photoId: null }); pageIds.push(result.post.id);
  }
  const firstPage = await call("anonymous", "posts.list", { identity: ids.a });
  equal(firstPage.posts.length, 10); assert.ok(firstPage.nextCursor); checks++; safe(firstPage);
  const secondPage = await call("anonymous", "posts.list", { identity: ids.a, cursor: firstPage.nextCursor });
  equal(secondPage.posts.length, 3); equal(secondPage.nextCursor, null);
  equal(new Set([...firstPage.posts, ...secondPage.posts].map(p => p.id)).size, 13);
  await call("b", "posts.list", { identity: ids.a, cursor: firstPage.nextCursor }, 400); // Cursor is audience-bound.
  for (const id of pageIds) await db.doc(`socialPosts/${id}`).delete();
  const image = await call("anonymous", "posts.image", { postId }); equal(typeof image.jpegBase64, "string"); safe(image); equal(deliveries, 1);
  equal(lastHeaders["cache-control"], "private, no-store, max-age=0"); equal(lastHeaders["x-content-type-options"], "nosniff");
  await ref("a").update({ photoRefs: {} }); equal((await list("anonymous")).length, 0);
  await call("anonymous", "posts.image", { postId }, 404);
  await ref("a").update({ photoRefs: { photo: true } });
  await photoRef("a").set({ ...originalPhoto, ownerId: ids.b }); equal((await list("anonymous")).length, 0);
  await call("anonymous", "posts.image", { postId }, 404);
  await photoRef("a").set(originalPhoto);
  handler = makeHandler(); // Independent backend instance/device uses the same receipt.
  await call("a", "posts.save", { ...basic, expectedRevision: 0 }, 409);
  equal((await db.collection("socialPosts").where("ownerUid", "==", ids.a).get()).size, 1);
  equal(preparations, 1);

  const approved = { ...basic, fields: { length: true, weight: true, date: "month", method: true, water: true } };
  saved = (await call("a", "posts.save", { ...approved, expectedRevision: saved.revision })).post;
  equal(preparations, 1); // Another device/profile edit does not regenerate derivatives.
  publicPosts = await list("b"); safe(publicPosts);
  equal(publicPosts[0].content.lengthCm, 53); equal(publicPosts[0].content.weightKg, 3.2);
  equal(publicPosts[0].content.caughtAt, original.caughtAt.slice(0, 7)); equal(publicPosts[0].content.method, "Feeder");
  equal(publicPosts[0].content.catalogueId, catalogue[0].id); equal(publicPosts[0].content.waterName, catalogue[0].name);
  await ref("a").update({ notes: "SECRET-NEW-NOTE", coordinates: { latitude: 49, longitude: 15 } });
  equal((await list("anonymous")).length, 1); // Unapproved private edits do not alter public content.
  await ref("a").update({ lengthCm: 54 });
  equal((await list("anonymous")).length, 0); // Approved source change invalidates the snapshot.
  await call("anonymous", "posts.image", { postId }, 404);
  equal((await call("a", "posts.own", { catchId: "catch" })).post.content.lengthCm, 53);
  saved = (await call("a", "posts.save", { ...approved, expectedRevision: saved.revision })).post;
  equal((await list("anonymous"))[0].content.lengthCm, 54);
  await ref("a").update({ privacy: { ...original.privacy, visibility: "public" } }); equal((await list("anonymous")).length, 0);
  saved = (await call("a", "posts.save", { ...approved, visibility: "friends", expectedRevision: saved.revision })).post;
  equal((await list("anonymous")).length, 0); equal((await list("c")).length, 0);
  for (const role of ["owner", "co"]) {
    equal((await list(role)).length, 0);
    await call(role, "posts.image", { postId }, 404); // Roles never bypass private/friends media.
    await call(role, "posts.delete", { postId }, 404);
  }
  await befriend(); equal((await list("b")).length, 1);
  await call("b", "posts.image", { postId });
  equal((await call("a", "posts.list", { identity: ids.a, previewAudience: "stranger" })).posts.length, 0);
  equal((await call("a", "posts.list", { identity: ids.a, previewAudience: "friend" })).posts.length, 1);
  await call("a", "posts.image", { postId, previewAudience: "stranger" }, 404);
  await call("a", "posts.image", { postId, previewAudience: "friend" });
  await call("b", "posts.list", { identity: ids.a, previewAudience: "friend" }, 403);
  await call("b", "posts.image", { postId, previewAudience: "friend" }, 403);
  await call("anonymous", "posts.list", { identity: ids.a, previewAudience: "friend" }, 403);
  await pairRef().update({ status: "unfriended" }); equal((await list("b")).length, 0);
  await call("b", "posts.image", { postId }, 404);
  await befriend(); await call("b", "block", { targetUid: ids.a, blocked: true });
  equal((await list("b")).length, 0); await call("b", "posts.image", { postId }, 404);
  await call("b", "block", { targetUid: ids.a, blocked: false }); await befriend();
  saved = (await call("a", "posts.save", { ...approved, visibility: "private", expectedRevision: saved.revision })).post;
  equal((await list("b")).length, 0); equal((await list("a")).length, 1);
  saved = (await call("a", "posts.save", { ...approved, expectedRevision: saved.revision })).post;
  // Revoke sharing while provider fetch is in flight: bytes must never leave API.
  duringDelivery = async () => postRef.update({ visibility: "private", revision: saved.revision + 1 });
  await call("anonymous", "posts.image", { postId }, 404); duringDelivery = null;
  saved = (await call("a", "posts.save", { ...approved, expectedRevision: saved.revision + 1 })).post;
  await photoRef("a").update({ deleted: true }); equal((await list("anonymous")).length, 0);
  await call("anonymous", "posts.image", { postId }, 404);
  await photoRef("a").set(originalPhoto);
  await ref("a").update({ deleted: true }); equal((await list("anonymous")).length, 0);
  await call("a", "posts.save", approved, 404);
  await ref("a").update({ deleted: false });
  await db.doc(`adminPublicModeration/${moderationKey(ids.a, "catch")}`).set({ hidden: true });
  equal((await list("anonymous")).length, 0); await call("anonymous", "posts.image", { postId }, 404);
  await db.doc(`adminPublicModeration/${moderationKey(ids.a, "catch")}`).delete();
  // Raw SDK cannot read media receipts or posts, even privileged roles.
  for (const role of ["anonymous", "a", "b", "owner", "co"]) {
    equal((await direct(role, `socialPosts/${postId}`)).status, 403);
    equal((await direct(role, `socialPosts/${postId}`, "PATCH", { fields: { ownerUid: { stringValue: ids[role] ?? "anonymous" } } })).status, 403);
  }
  const receipts = await db.collection(`users/${ids.a}/socialMediaReceipts`).get(); equal(receipts.size, 1);
  equal((await direct("a", receipts.docs[0].ref.path)).status, 403);
  await call("a", "posts.delete", { postId, expectedRevision: saved.revision });
  equal((await list("anonymous")).length, 0); equal((await call("a", "posts.own", { catchId: "catch" })).post.deleted, true);
  equal((await ref("a").get()).exists, true); equal((await photoRef("a").get()).exists, true);
  equal((await db.doc(`users/${ids.a}/progression/state`).get()).data(), privateXp);
  await call("a", "posts.save", { ...approved, expectedRevision: saved.revision }, 409); // Delayed device cannot restore tombstone.
  saved = (await call("a", "posts.save", { ...approved, expectedRevision: saved.revision + 1 })).post;
  // Two server instances cannot both consume a transformation for the same asset.
  const concurrentIdentity = { uid: ids.b, catchId: "concurrent", photoId: "photo" };
  const concurrentPhoto = { ...originalPhoto,
    cloud: { ...originalPhoto.cloud, objectKey: `users/${ids.b}/catches/concurrent/photos/photo/original` } };
  await db.doc(`users/${ids.b}/catches/concurrent`).set({ ...original, ownerId: ids.b, id: "concurrent" });
  await db.doc(`users/${ids.b}/catches/concurrent/photos/photo`).set(concurrentPhoto);
  let releasePrepare, enteredPrepare, prepareCalls = 0;
  const entered = new Promise(resolve => { enteredPrepare = resolve; });
  const released = new Promise(resolve => { releasePrepare = resolve; });
  const slowProvider = { async prepare(_identity, source) {
    prepareCalls++; enteredPrepare(); await released;
    return { version: "123", sha256: source.cloud.sha256, transformationVersion: 1, width: 100, height: 80 };
  } };
  const firstCoordinator = createSocialPhotoCoordinator({ db, photo: slowProvider, now: () => time });
  const secondCoordinator = createSocialPhotoCoordinator({ db, photo: slowProvider, now: () => time });
  const firstPreparation = firstCoordinator.prepare(concurrentIdentity, concurrentPhoto);
  let deadline;
  try { await Promise.race([entered, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Preparation lease timed out")), 5000); })]); }
  finally { clearTimeout(deadline); }
  await assert.rejects(secondCoordinator.prepare(concurrentIdentity, concurrentPhoto), /photo_preparing/); checks++;
  equal(prepareCalls, 1); releasePrepare();
  const firstReceipt = await firstPreparation;
  equal(await secondCoordinator.prepare(concurrentIdentity, concurrentPhoto), firstReceipt); equal(prepareCalls, 1);
  equal((await db.collection(`users/${ids.b}/socialMediaReceipts`).get()).size, 1);
  // A delayed provider result cannot recreate receipts after account cleanup.
  const deletingIdentity = { uid: ids.c, catchId: "deleting", photoId: "photo" };
  const deletingPhoto = { ...originalPhoto,
    cloud: { ...originalPhoto.cloud, objectKey: `users/${ids.c}/catches/deleting/photos/photo/original` } };
  await db.doc(`users/${ids.c}/catches/deleting`).set({ ...original, ownerId: ids.c, id: "deleting" });
  await db.doc(`users/${ids.c}/catches/deleting/photos/photo`).set(deletingPhoto);
  let releaseDeleted, enteredDeleted;
  const deletionEntered = new Promise(resolve => { enteredDeleted = resolve; });
  const deletionReleased = new Promise(resolve => { releaseDeleted = resolve; });
  const deletingCoordinator = createSocialPhotoCoordinator({ db, now: () => time, photo: { async prepare(_identity, source) {
    enteredDeleted(); await deletionReleased;
    return { version: "123", sha256: source.cloud.sha256, transformationVersion: 1, width: 100, height: 80 };
  } } });
  const deletedPreparation = deletingCoordinator.prepare(deletingIdentity, deletingPhoto);
  try { await Promise.race([deletionEntered, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Deletion preparation timed out")), 5000); })]); }
  finally { clearTimeout(deadline); }
  const concurrentDeletion = createAccountDeletionService({ db, auth, now: () => time, photoDeletion: { enqueue: async () => {} } });
  await concurrentDeletion.request(ids.c); await concurrentDeletion.advanceOwner(ids.c, { maxSteps: 30, maxMillis: 20_000 });
  equal((await db.collection(`users/${ids.c}/socialMediaReceipts`).get()).size, 0);
  releaseDeleted(); await assert.rejects(deletedPreparation, /photo_preparing/); checks++;
  equal((await db.collection(`users/${ids.c}/socialMediaReceipts`).get()).size, 0);
  await assert.rejects(deletingCoordinator.prepare(deletingIdentity, deletingPhoto), /post_unavailable/); checks++;
  await db.doc(`accountDeletions/${ids.a}`).set({ status: "requested", ownerUid: ids.a });
  await call("anonymous", "posts.image", { postId }, 403);
  await db.doc(`accountDeletions/${ids.a}`).delete();
  const deletion = createAccountDeletionService({ db, auth, now: () => time, photoDeletion: { enqueue: async () => {} } });
  await deletion.request(ids.a); await deletion.advanceOwner(ids.a, { maxSteps: 30, maxMillis: 20_000 });
  equal((await postRef.get()).exists, false); equal((await db.collection(`users/${ids.a}/socialMediaReceipts`).get()).size, 0);
  await call("anonymous", "posts.image", { postId }, 404);
  equal((await db.doc(`publicProfiles/${ids.b}`).get()).exists, true);
  console.log(`Social publications: ${checks} real Auth/Firestore ownership, privacy, revocation, derivative caching and deletion checks PASS; 5 accounts`);
} finally { await terminate(clientDb); await deleteClientApp(clientApp); await deleteApp(app); }
