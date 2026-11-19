import { publicProfileFixturePayload } from "./social-publication-fixture.mjs";
// Synthetic local fixtures only; never production or paid media providers.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp as clientApp, deleteApp as deleteClientApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore as clientFirestore, connectFirestoreEmulator, terminate } from "firebase/firestore";
import { createFirestoreSyncAdapter } from "../src/features/sync/data/firestoreSyncAdapter.js";
import { createPublicProfileService } from "../src/features/social/server/publicProfileService.js";
import { createSocialHandler } from "../src/features/social/server/socialApi.js";
import { canonicalPair } from "../src/features/social/data/socialModel.js";
import { publicationId } from "../src/features/social/data/publicationModel.js";
import { moderationKey } from "../src/features/admin/server/adminSupportStore.js";
import { publicAchievementChoices } from "../src/features/social/data/publicProgressionModel.js";
import { createAccountDeletionService } from "../src/server/accountDeletion.js";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local Auth/Firestore emulators required");
const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `feed-${suffix}`), db = getFirestore(app), auth = getAuth(app);
const client = clientApp({ apiKey: "demo-key", projectId: "demo-chytnucz-local", authDomain: "localhost" }, `feed-client-${suffix}`);
const clientAuth = initializeAuth(client, { persistence: inMemoryPersistence }), clientDb = clientFirestore(client);
connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(clientDb, "127.0.0.1", 8080);
const ids = {}, tokens = {}, originals = new Map();
let time = Date.now(), checks = 0, requests = 0;
const handler = createSocialHandler({ service: createPublicProfileService({ db, auth, avatar: {}, now: () => time,
  cursorSecret: "synthetic-social-feed-secret-at-least32", socialPhoto: {
    prepare: async (_identity, photo) => ({ version: "123", sha256: photo.cloud.sha256, transformationVersion: 1, width: 100, height: 80 }),
    delivery: async () => new Uint8Array([255, 216, 255, 217]),
  } }) });
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
async function call(role, action, payload = {}, status = 200) {
  if (++requests % 15 === 0) time += 60000;
  const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ method: "POST", headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}, body: { action, ...await publicProfileFixturePayload(action, payload, db, ids[role]) } }, res);
  assert.equal(res.statusCode, status, `${role}/${action}: ${JSON.stringify(res.body)}`); checks++; return res.body;
}
const feed = (role = "b", mode = "global", more = {}) => call(role, "feed.list", { mode, ...more });
const source = (role, id) => db.doc(`users/${ids[role]}/catches/${id}`);
const post = (role, id) => db.doc(`socialPosts/${publicationId(ids[role], id)}`);
const relation = () => db.doc(`socialRelationships/${canonicalPair(ids.a, ids.b)}`);
const befriend = () => relation().set({ memberUids: [ids.a, ids.b], requestedBy: ids.a, status: "accepted", revision: 1, createdAt: time, updatedAt: time });
const saveProfile = (role, sections = { catches: "public", gallery: "public" }, visibility = "public") => call(role, "save", { profile: { handle: `feed_${role}_${suffix}`, displayName: `Synthetic feed ${role}`, visibility, sections } });
async function publish(role, id, visibility = "public", photoId = null) {
  const own = await call(role, "posts.own", { catchId: id });
  return call(role, "posts.save", { catchId: id, photoId, visibility, fields: { length: true }, description: "Schválený příspěvek", expectedRevision: own.post?.revision ?? 0 });
}
function safe(page) {
  assert.doesNotMatch(JSON.stringify(page), /SECRET|latitude|longitude|sourceCatchId|sourcePhotoId|sourceEntryId|objectKey|sha256|mediaReceipt|sourceFingerprint|photoRefs|ownerId/); checks++;
}
const originalConfig = await db.doc("adminConfig/social").get();
try {
  for (const role of ["a", "b", "c"]) {
    ids[role] = `feed-${role}-${suffix}`;
    await auth.createUser({ uid: ids[role], email: `${ids[role]}@example.test`, password: `Synthetic-${suffix}-9!` });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${ids[role]}@example.test`, password: `Synthetic-${suffix}-9!`, returnSecureToken: true }),
    });
    equal(response.status, 200); tokens[role] = (await response.json()).idToken;
    await saveProfile(role);
    await signInWithEmailAndPassword(clientAuth, `${ids[role]}@example.test`, `Synthetic-${suffix}-9!`);
    const adapter = createFirestoreSyncAdapter({ db: clientDb, getCurrentUserId: () => clientAuth.currentUser?.uid ?? null });
    for (const id of role === "a" ? ["public", "friends", "private", "photo", ...Array.from({ length: 25 }, (_, i) => `page${i}`)] : ["public"]) {
      const photo = { id: "photo", name: "synthetic.jpg", type: "image/jpeg", size: 5000, deleted: false, deletedAt: null, focalX: 0.5, focalY: 0.5, zoom: 1, sortIndex: 0,
        cloud: { provider: "cloudinary", state: "synced", objectKey: `users/${ids[role]}/catches/${id}/photos/photo/original`, sha256: "a".repeat(64) } };
      const record = { id, ownerId: ids[role], species: "Kapr", lengthCm: 53, caughtAt: new Date(time).toISOString(), deleted: false,
        privacy: { visibility: "private", photoVisibility: "private", locationPrecision: "none", privateSpot: true, nearbyEligible: false, heatmapEligible: false },
        photoRefs: id === "photo" ? { photo: true } : {}, photos: id === "photo" ? [photo] : [], notes: "SECRET-NOTE", coordinates: { latitude: 50.123456, longitude: 14.654321 } };
      await adapter.write({ ownerId: ids[role], entityType: "catch", entityId: id, record, expectedRevision: null, operationId: randomUUID(), localRevision: 1 });
      originals.set(`${role}/${id}`, (await source(role, id).get()).data());
    }
  }
  await call("anonymous", "feed.list", { mode: "global" }, 401);
  await call("b", "feed.list", { mode: "nearby" }, 400);
  await call("b", "feed.list", { limit: 20 }, 400);
  await publish("a", "public"); await publish("a", "friends", "friends"); await publish("a", "private", "private"); await publish("a", "photo", "public", "photo");
  await publish("b", "public"); await publish("c", "public");
  equal((await feed()).posts.length, 4); safe(await feed()); safe(await feed("a"));
  equal((await feed("b", "friends")).posts.length, 0);
  await befriend(); equal((await feed("b", "friends")).posts.length, 3); equal((await feed("a", "friends")).posts.length, 1);
  await relation().update({ status: "unfriended" }); equal((await feed("b", "friends")).posts.length, 0); await befriend();
  await db.doc(`socialBlocks/${ids.a}/blocked/${ids.b}`).set({ createdAt: time }); equal((await feed()).posts.length, 2); equal((await feed("b", "friends")).posts.length, 0);
  await db.doc(`socialBlocks/${ids.a}/blocked/${ids.b}`).delete();
  await saveProfile("a", { catches: "friends", gallery: "friends" }); equal((await feed()).posts.length, 2); equal((await feed("b", "friends")).posts.length, 3); await saveProfile("a");
  await source("a", "public").update({ lengthCm: 99 }); equal((await feed()).posts.length, 3); await source("a", "public").set(originals.get("a/public"));
  await source("a", "photo").update({ photoRefs: {} }); equal((await feed()).posts.length, 3); await source("a", "photo").set(originals.get("a/photo"));
  equal(Object.hasOwn((await source("a", "photo").collection("photos").doc("photo").get()).data(), "ownerId"), false);
  await source("a", "public").update({ deleted: true }); equal((await feed()).posts.length, 3); await source("a", "public").set(originals.get("a/public"));
  await db.doc(`adminPublicModeration/${moderationKey(ids.a, "public")}`).set({ hidden: true }); equal((await feed()).posts.length, 3); await db.doc(`adminPublicModeration/${moderationKey(ids.a, "public")}`).delete();
  await db.doc(`accountDeletions/${ids.a}`).set({ status: "requested" }); equal((await feed()).posts.length, 2); await db.doc(`accountDeletions/${ids.a}`).delete();
  // 25 equal-timestamp rows exercise deterministic document-ID tiebreaking.
  const pageTime = time + 1000000;
  for (let i = 0; i < 25; i++) { await publish("a", `page${i}`); await post("a", `page${i}`).update({ createdAt: pageTime }); }
  const first = await feed("b", "global", { limit: 3 }); equal(first.posts.length, 3); safe(first); assert.ok(first.nextCursor); checks++;
  await call("c", "feed.list", { mode: "global", limit: 3, cursor: first.nextCursor }, 400);
  await call("b", "feed.list", { mode: "friends", limit: 3, cursor: first.nextCursor }, 400);
  await call("b", "feed.list", { mode: "global", limit: 10, cursor: first.nextCursor }, 400);
  const seen = first.posts.map(row => row.id); let cursor = first.nextCursor;
  // A stale page cursor does not authorize a subsequently deleted source.
  const unseenId = Array.from({ length: 25 }, (_, i) => `page${i}`).find(id => !seen.includes(publicationId(ids.a, id)));
  await source("a", unseenId).update({ deleted: true });
  for (let pages = 0; cursor && pages < 15; pages++) { const page = await feed("b", "global", { limit: 3, cursor }); safe(page); seen.push(...page.posts.map(row => row.id)); cursor = page.nextCursor; }
  equal(cursor, null); equal(seen.length, 28); equal(new Set(seen).size, 28); equal(seen.includes(publicationId(ids.a, unseenId)), false);
  time += 900001; await call("b", "feed.list", { mode: "global", limit: 3, cursor: first.nextCursor }, 400);
  // A full denied window still returns an opaque continuation, then progresses.
  for (let i = 0; i < 25; i++) await source("a", `page${i}`).update({ deleted: true });
  const denied = await feed(); equal(denied.posts.length, 0); assert.ok(denied.nextCursor); checks++; safe(denied);
  const tail = await feed("b", "global", { cursor: denied.nextCursor }); equal(tail.posts.length, 4); equal(tail.nextCursor, null);
  await db.doc(`accountDeletions/${ids.b}`).set({ status: "requested" }); await call("b", "feed.list", {}, 403); await db.doc(`accountDeletions/${ids.b}`).delete();
  await db.doc("adminConfig/social").set({ feedsEnabled: false }, { merge: true }); await call("b", "feed.list", {}, 503); await db.doc("adminConfig/social").update({ feedsEnabled: true });
  for (const role of ["anonymous", "a", "b", "c"]) {
    const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/socialPosts`, { headers: tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {} }); equal(res.status, 403);
  }
  const achievement = publicAchievementChoices()[0], entryIds = [randomUUID(), randomUUID(), randomUUID()];
  await call("a", "save", { profile: { handle: `feed_a_${suffix}`, displayName: "Synthetic feed a", visibility: "public",
    sections: { catches: "public", gallery: "public", achievements: "public" }, sharedAchievementIds: [achievement.id] } });
  await db.doc(`users/${ids.a}/serverProgressionState/summary`).set({ ownerId: ids.a, serverEventXp: 120 });
  const entry = async (kind, entryId, extra = {}, status = 200) => {
    time += 60000;
    return call("a", "entries.save", { entryId, kind, visibility: "public", expectedRevision: 0, description: "Výslovně publikovaný příběh", ...extra }, status);
  };
  const experience = (await entry("experience", entryIds[0], { title: "Ráno u vody" })).post;
  const highlight = (await entry("achievement", entryIds[1], { achievementId: achievement.id })).post;
  const milestone = (await entry("milestone", entryIds[2])).post;
  equal(experience.kind, "experience"); equal(highlight.content.achievement.source, "unverified"); equal(highlight.content.achievement.rewardGranted, false);
  equal(milestone.content.progression.xp, 120); safe(await feed());
  const has = async id => (await feed()).posts.some(row => row.id === id);
  equal(await has(experience.id), true); equal(await has(highlight.id), true); equal(await has(milestone.id), true);
  const friendEntry = (await entry("experience", randomUUID(), { visibility: "friends" })).post;
  equal(await has(friendEntry.id), false);
  equal((await feed("b", "friends")).posts.some(row => row.id === friendEntry.id), true);
  await relation().update({ status: "unfriended" }); equal((await feed("b", "friends")).posts.some(row => row.id === friendEntry.id), false); await befriend();
  const privateEntry = (await entry("experience", randomUUID(), { visibility: "private" })).post;
  equal(await has(privateEntry.id), false); equal((await feed("b", "friends")).posts.some(row => row.id === privateEntry.id), false);
  time+=60000; // A new intentional edit, outside the posting burst window.
  const editedDraft=(await call("a","entries.save",{entryId:privateEntry.sourceEntryId,kind:"experience",visibility:"public",expectedRevision:privateEntry.revision,title:"Zveřejněný koncept",description:"Výslovně potvrzená změna viditelnosti"})).post;
  equal(editedDraft.id,privateEntry.id); equal(editedDraft.revision,2); equal(await has(privateEntry.id),true);
  Object.assign(privateEntry,editedDraft);
  await entry("experience", entryIds[0], {}, 409); // Duplicate delivery cannot create a second post.
  await entry("experience", randomUUID(), { gps: { latitude: 1 } }, 400);
  await call("anonymous", "entries.save", { entryId: randomUUID(), kind: "experience", visibility: "public", expectedRevision: 0, description: "Příběh" }, 401);
  await call("a", "save", { profile: { handle: `feed_a_${suffix}`, displayName: "Synthetic feed a", visibility: "public",
    sections: { catches: "public", gallery: "public", achievements: "public" }, sharedAchievementIds: [] } });
  equal(await has(highlight.id), false); equal(await has(experience.id), true);
  equal((await call("a","posts.view",{postId:highlight.id})).post.sourceAvailable,false);
  await call("b","posts.view",{postId:highlight.id},404);
  await db.doc(`users/${ids.a}/serverProgressionState/summary`).update({ serverEventXp: 119 }); equal(await has(milestone.id), false);
  equal((await call("a","posts.view",{postId:milestone.id})).post.sourceAvailable,false);
  equal((await db.doc(`users/${ids.a}/serverProgressionState/summary`).get()).data().serverEventXp, 119);
  for (const item of [experience, highlight, milestone, friendEntry, privateEntry]) await call("a", "posts.delete", { postId: item.id, expectedRevision: item.revision });
  // Full account cleanup and a missing profile both invalidate feed entries.
  const deletion = createAccountDeletionService({ db, auth, now: () => time, photoDeletion: { enqueue: async () => {} } });
  await deletion.request(ids.c); await deletion.advanceOwner(ids.c, { maxSteps: 30, maxMillis: 20000 });
  equal((await source("c", "public").get()).exists, false); equal((await post("c", "public").get()).exists, false);
  await db.doc(`publicProfiles/${ids.a}`).delete();
  const remaining = []; let remainingCursor;
  do { const page = await feed("b", "global", { ...(remainingCursor ? { cursor: remainingCursor } : {}) }); remaining.push(...page.posts); remainingCursor = page.nextCursor; } while (remainingCursor);
  equal(remaining.length, 1); equal(remaining[0].author.uid, ids.b);
  console.log(`Social feed: ${checks} Auth/Firestore privacy, bounded pagination, revocation and cursor checks PASS; 3 accounts`);
} finally {
  // Delete only this run's random synthetic namespace; never reset shared data.
  for (const uid of Object.values(ids)) {
    const posts = await db.collection("socialPosts").where("ownerUid", "==", uid).limit(40).get();
    await Promise.all(posts.docs.map(row => row.ref.delete()));
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.recursiveDelete(db.doc(`socialBlocks/${uid}`));
    await db.doc(`publicProfiles/${uid}`).delete(); await db.doc(`accountDeletions/${uid}`).delete();
    await auth.deleteUser(uid).catch(error => { if (error.code !== "auth/user-not-found") throw error; });
  }
  if (ids.a && ids.b) await relation().delete();
  if (originalConfig.exists) await db.doc("adminConfig/social").set({ feedsEnabled: originalConfig.data().feedsEnabled ?? FieldValue.delete() }, { merge: true });
  else await db.doc("adminConfig/social").delete();
  await terminate(clientDb); await deleteClientApp(client); await deleteApp(app);
}
