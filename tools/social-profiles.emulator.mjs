import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createPublicProfileService } from "../src/features/social/server/publicProfileService.js";
import { createSocialHandler } from "../src/features/social/server/socialApi.js";
import { canonicalPair } from "../src/features/social/data/socialModel.js";
import { moderationKey } from "../src/features/admin/server/adminSupportStore.js";
import { createAccountDeletionService } from "../src/server/accountDeletion.js";
import { createAvatarCoordinator } from "../src/features/social/server/socialAvatarCoordinator.js";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators required");
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `profiles-${randomUUID()}`), db = getFirestore(app), auth = getAuth(app);
const suffix = randomUUID().replaceAll("-", "").slice(0, 8), ids = {}, tokens = {}, assets = new Set();
let time = Date.now(), checks = 0, photoDeliveries = 0;
const avatar = { save: async (uid, bytes, assetId) => { assets.add(`${uid}/${assetId}`); return { version: String(time) }; },
  delivery: async (uid, assetId) => { assert.ok(assets.has(`${uid}/${assetId}`)); return new Uint8Array([255,216,255,217]); }, remove: async (uid, assetId) => { assets.delete(`${uid}/${assetId}`); } };
let handler;
async function call(role, action, payload = {}, expected = 200) {
  const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "POST", headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}, body: { action, ...payload } }, res);
  assert.equal(res.statusCode, expected, `${action}: ${JSON.stringify(res.body)}`); checks++; return res.body;
}
function equal(a,b) { assert.deepEqual(a,b); checks++; }
try {
  for (const role of ["a", "b", "c", "owner", "co"]) {
    const uid = `profiles-${role}-${suffix}`; ids[role] = uid;
    await auth.createUser({ uid, email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!` });
    const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!`, returnSecureToken: true }) });
    assert.equal(res.status, 200); tokens[role] = (await res.json()).idToken;
  }
  handler = createSocialHandler({ service: createPublicProfileService({ db, auth, avatar, env: { CHYTNU_OWNER_UID: ids.owner, CHYTNU_CO_CREATOR_UID: ids.co }, now: () => time,
    socialPhoto: { prepare: async (_identity, photo) => ({ version: "123", sha256: photo.cloud.sha256, transformationVersion: 1, width: 100, height: 80 }),
      delivery: async () => { photoDeliveries++; return new Uint8Array([255,216,255,217]); } } }) });
  const original = { ownerId: ids.a, id: "catch", species: "Kapr", caughtAt: new Date(time).toISOString(), lengthCm: 53, notes: "SECRET-NOTE", waterName: "SECRET-SPOT", coordinates: { latitude: 50.123456, longitude: 14.654321 }, deleted: false };
  await db.doc(`users/${ids.a}/catches/catch`).set(original);
  await db.doc(`users/${ids.a}/catches/catch/photos/photo`).set({ ownerId: ids.a, type: "image/jpeg", deleted: false, cloud: { state: "synced", provider: "cloudinary", objectKey: "SECRET-KEY", sha256: "a".repeat(64) } });
  await db.doc(`users/${ids.b}/catches/other`).set({ ...original, ownerId: ids.b, id: "other" });
  await call("anonymous", "self", {}, 401); await call("anonymous", "save", { profile: {} }, 401);
  const a = { handle: `a_${suffix}`, displayName: "Fixture A", bio: "Fishing\nDiary", region: "Jižní Morava", specialization: "Feeder", favoriteSpecies: "Kapr" };
  equal((await call("a", "save", { profile: a })).profile.visibility, "private");
  equal((await call("anonymous", "view", { identity: ids.a })).profile, null);
  equal((await call("b", "view", { identity: `@${a.handle}` })).profile, null);
  await call("b", "save", { profile: { ...a, displayName: "Thief" } }, 409);
  for (const extra of [{ uid: ids.b }, { badgeRole: "OWNER" }, { avatarAssetId: "a".repeat(32) }, { role: "CO_CREATOR" }]) await call("a", "save", { profile: { ...a, ...extra } }, 400);
  await call("a", "save", { uid: ids.b, profile: a }, 400);
  await call("a", "save", { profile: { ...a, sharedCatchIds: ["other"] } }, 400);
  const published = { ...a, visibility: "public", discoverable: true, sharedCatchIds: ["catch"], sharedPhotos: [{ catchId: "catch", photoId: "photo" }],
    sections: { interests: "friends", catches: "public", gallery: "public", statistics: "public", trophies: "public", achievements: "public" } };
  await call("a", "save", { profile: published });
  const publicView = (await call("anonymous", "view", { identity: `@${a.handle.toUpperCase()}` })).profile;
  equal(publicView.catches.length, 1); equal(publicView.statistics.catchCount, 1); equal(publicView.region, undefined); equal(publicView.badgeRole, null);
  assert.doesNotMatch(JSON.stringify(publicView), /SECRET|latitude|longitude|email|permissions|avatarAssetId|avatarRevision|sharedCatchIds|objectKey/); checks++;
  equal((await call("a", "preview", { audience: "stranger" })).profile.region, undefined);
  equal((await call("a", "preview", { audience: "friend" })).profile.region, "Jižní Morava");
  await db.doc(`socialRelationships/${canonicalPair(ids.a, ids.b)}`).set({ status: "accepted", requestedBy: ids.a, memberUids: [ids.a, ids.b], createdAt: time, updatedAt: time });
  equal((await call("b", "view", { identity: ids.a })).profile.region, "Jižní Morava");
  equal((await call("c", "view", { identity: ids.a })).profile.region, undefined);
  await call("anonymous", "image", { identity: ids.a, kind: "catch", catchId: "catch", photoId: "photo" }); equal(photoDeliveries, 1);
  // Legacy selected photos obey the same approval/revocation boundary as posts.
  await db.doc(`users/${ids.a}/catches/catch`).update({privacy:"public"});
  equal((await call("anonymous","view",{identity:ids.a})).profile.photos.length,0);
  equal((await call("anonymous","view",{identity:ids.a})).profile.catches.length,0);
  await call("anonymous","image",{identity:ids.a,kind:"catch",catchId:"catch",photoId:"photo"},404);
  await db.doc(`users/${ids.a}/catches/catch`).set(original);
  await db.doc(`users/${ids.a}/catches/catch`).update({lengthCm:54});
  equal((await call("anonymous","view",{identity:ids.a})).profile.photos.length,0);
  await db.doc(`users/${ids.a}/catches/catch`).set(original);
  await call("anonymous", "image", { identity: ids.a, kind: "catch", catchId: "catch", photoId: "unselected" }, 404);
  await db.doc(`adminPublicModeration/${moderationKey(ids.a, "catch")}`).set({ targetUid: ids.a, hidden: true });
  const hidden = (await call("anonymous", "view", { identity: ids.a })).profile;
  equal(hidden.photos.length, 0); equal(hidden.catches.length, 0); equal(hidden.trophies.length, 0); equal(hidden.statistics.catchCount, 0);
  await call("anonymous", "image", { identity: ids.a, kind: "catch", catchId: "catch", photoId: "photo" }, 404); equal(photoDeliveries, 1);
  await db.doc(`adminPublicModeration/${moderationKey(ids.a, "catch")}`).delete();
  await call("a", "save", { profile: { ...published, discoverable: false } });
  equal((await call("anonymous", "view", { identity: `@${a.handle}` })).profile, null);
  equal((await call("anonymous", "view", { identity: ids.a })).profile.uid, ids.a);
  await call("a", "save", { profile: { ...published, handle: `new_${suffix}` } });
  await call("b", "save", { profile: { ...a, displayName: "Old identity thief" } }, 409);
  equal((await call("anonymous", "view", { identity: `@${a.handle}` })).profile, null);
  await call("a", "report", { targetUid: `@new_${suffix}`, reason: "Self report not allowed" }, 404);
  await call("b", "report", { targetUid: `@new_${suffix}`, reason: "Synthetic moderation report" });
  equal((await db.collection("socialReports").where("targetUid", "==", ids.a).get()).size, 1);
  time += 60_000; // Separate minute for media/mutation checks, no provider calls.
  await call("a", "avatar.set", { jpegBase64: "synthetic-provider-adapter-fixture" });
  const av = (await call("anonymous", "view", { identity: ids.a })).profile;
  equal(typeof av.avatarVersion, "string"); equal(av.avatarAssetId, undefined);
  await call("anonymous", "image", { identity: ids.a, kind: "avatar" });
  await call("a", "avatar.remove"); equal((await call("anonymous", "view", { identity: ids.a })).profile.avatarVersion, undefined);
  await call("a", "avatar.set", { jpegBase64: "synthetic-provider-adapter-fixture" });
  equal((await call("anonymous", "view", { identity: ids.a })).profile.avatarVersion === av.avatarVersion, false);
  for (const role of ["owner", "co"]) {
    await call(role, "save", { profile: { handle: `${role}_${suffix}`, displayName: role, visibility: "public" } });
    equal((await call("anonymous", "view", { identity: ids[role] })).profile.badgeRole, role === "owner" ? "OWNER" : "CO_CREATOR");
  }
  await call("b", "block", { targetUid: ids.a, blocked: true });
  await call("b", "view", { identity: ids.a }, 404);
  await call("a", "view", { identity: ids.b }, 404);
  await call("b", "block", { targetUid: ids.a, blocked: false });
  await call("a", "save", { profile: { ...published, handle: `new_${suffix}`, visibility: "private" } });
  equal((await call("b", "view", { identity: ids.a })).profile, null);
  equal((await call("anonymous", "view", { identity: ids.a })).profile, null);
  equal((await db.doc(`users/${ids.a}/catches/catch`).get()).data(), original);
  await db.doc(`accountSuspensions/${ids.c}`).set({ suspended: true });
  await call("c", "self", {}, 403); await call("c", "save", { profile: { handle: `c_${suffix}`, displayName: "C" } }, 403);
  await db.doc("adminConfig/social").set({ profilesEnabled: false });
  await call("anonymous", "view", { identity: ids.owner }, 503);
  await call("owner", "save", { profile: { handle: `owner_${suffix}`, displayName: "Owner" } }, 503);
  await db.doc("adminConfig/social").delete();
  await db.doc("serverRateLimits/social-http-day").set({ window: Math.floor(time / 86_400_000), count: 2000 });
  await call("anonymous", "view", { identity: ids.owner }, 429);
  await db.doc("serverRateLimits/social-http-day").delete();
  const coordinator = createAvatarCoordinator({ db, avatar, now: () => time });
  const deletion = createAccountDeletionService({ db, auth, now: () => time, deleteSocialAvatar: (uid, limit) => coordinator.cleanup(uid, limit), photoDeletion: { enqueue: async () => {} } });
  await deletion.request(ids.a); await deletion.advanceOwner(ids.a, { maxSteps: 30, maxMillis: 20_000 });
  equal([...assets].filter(asset => asset.startsWith(`${ids.a}/`)).length, 0);
  equal((await db.doc(`publicProfiles/${ids.a}`).get()).exists, false);
  equal((await db.collection("socialReports").where("targetUid", "==", ids.a).get()).size, 0);
  equal((await db.doc(`users/${ids.b}/catches/other`).get()).exists, true);
  console.log(`Public profiles integration: ${checks} authenticated/anonymous/privacy checks PASS`);
} finally { await deleteApp(app); }
