import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createSocialRepository } from "../src/features/social/server/socialRepository.js";
import { canonicalPair } from "../src/features/social/data/socialModel.js";
import { createAccountDeletionService } from "../src/server/accountDeletion.js";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators required");
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `social-${randomUUID()}`), db = getFirestore(app), auth = getAuth(app);
const suffix = randomUUID().replaceAll("-", "").slice(0, 10), ids = {}, tokens = {};
let time = Date.now(), checks = 0;
const repo = createSocialRepository({ db, auth, now: () => time });
async function rejected(action, code) { await assert.rejects(action, code ? new RegExp(code) : undefined); checks++; }
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }
try {
  for (const role of ["a", "b", "c", "owner", "co"]) {
    const uid = `social-${role}-${suffix}`; ids[role] = uid;
    await auth.createUser({ uid, email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!` });
    if (["owner", "co"].includes(role)) await auth.setCustomUserClaims(uid, { role: role === "owner" ? "OWNER" : "CO_CREATOR" });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!`, returnSecureToken: true }) });
    equal(response.status, 200); tokens[role] = (await response.json()).idToken;
  }
  await rejected(() => repo.saveProfile("", {}), "unauthenticated");
  const pa = { handle: `a_${suffix}`, displayName: "Synthetic angler A" }, pb = { handle: `b_${suffix}`, displayName: "Synthetic angler B", visibility: "public", discoverable: true };
  await db.doc("adminConfig/social").delete();
  await rejected(() => repo.saveProfile(tokens.a, pa), "social_disabled");
  await db.doc("adminConfig/social").set({ enabled: true }); // Emulator fixture only; no production activation.
  equal((await repo.saveProfile(tokens.a, pa)).visibility, "private");
  await repo.saveProfile(tokens.b, pb);
  equal(await repo.getProfile(tokens.b, ids.a), null);
  equal((await repo.getProfile(tokens.a, ids.b)).uid, ids.b);
  equal((await repo.findByHandle(tokens.a, pb.handle.toUpperCase())).uid, ids.b);
  equal(await repo.findByHandle(tokens.b, pa.handle), null);
  for (const role of ["owner", "co"]) equal(await repo.getProfile(tokens[role], ids.a), null);
  for (const extra of [{ uid: ids.b }, { role: "OWNER" }, { coordinates: { latitude: 50 } }, { xp: 999 }])
    await rejected(() => repo.saveProfile(tokens.a, { ...pa, ...extra }), "invalid_profile");
  await rejected(() => repo.saveProfile(tokens.c, { ...pa, displayName: "Handle thief" }), "handle_taken");
  await repo.relationship(tokens.a, ids.b, "request");
  await rejected(() => repo.relationship(tokens.a, ids.b, "accept"), "invalid_request");
  await rejected(() => repo.relationship(tokens.c, ids.a, "accept"), "invalid_request");
  equal((await repo.relationship(tokens.b, ids.a, "request")).status, "pending");
  equal((await repo.relationship(tokens.b, ids.a, "accept")).status, "accepted");
  await repo.saveProfile(tokens.a, { ...pa, visibility: "friends" });
  equal((await repo.getProfile(tokens.b, ids.a)).uid, ids.a);
  equal(await repo.getProfile(tokens.c, ids.a), null);
  await repo.block(tokens.b, ids.a);
  equal((await db.doc(`socialRelationships/${canonicalPair(ids.a, ids.b)}`).get()).exists, false);
  await rejected(() => repo.getProfile(tokens.a, ids.b), "social_unavailable");
  await rejected(() => repo.relationship(tokens.a, ids.b, "request"), "social_unavailable");
  await repo.block(tokens.b, ids.a, false);
  equal(await repo.getProfile(tokens.b, ids.a), null); // Unblock never restores friendship.
  await db.doc(`accountSuspensions/${ids.c}`).set({ suspended: true });
  await rejected(() => repo.saveProfile(tokens.c, { ...pb, handle: `c_${suffix}` }), "account_unavailable");
  await db.doc(`accountSuspensions/${ids.c}`).delete();
  time += 60_000;
  for (let i = 0; i < 20; i++) await repo.saveProfile(tokens.owner, { handle: `owner_${suffix}`, displayName: "Owner fixture" });
  await rejected(() => repo.saveProfile(tokens.owner, { handle: `owner_${suffix}`, displayName: "Owner fixture" }), "social_rate_limit");
  // Concurrent handle claims: exactly one authenticated account wins.
  time += 60_000;
  const race = await Promise.allSettled(["b", "c"].map(role => repo.saveProfile(tokens[role], { handle: `race_${suffix}`, displayName: role })));
  equal(race.filter(r => r.status === "fulfilled").length, 1);
  equal((await repo.saveProfile(tokens.owner, { handle: `owner_${suffix}`, displayName: "Owner fixture" })).uid, ids.owner);
  await repo.saveProfile(tokens.a, { ...pa, handle: `renamed_${suffix}`, visibility: "public", discoverable: true });
  equal(await repo.findByHandle(tokens.c, pa.handle), null);
  equal((await repo.findByHandle(tokens.c, `renamed_${suffix}`)).uid, ids.a);
  await db.doc(`crews/fixture-${suffix}`).set({ ownerUid: ids.a, memberUids: [ids.a, ids.b], name: "Fixture crew", visibility: "private", createdAt: time, updatedAt: time });
  await db.doc(`users/${ids.a}/catches/legacy`).set({ notes: "Unchanged private fixture" });
  await db.doc(`users/${ids.b}/catches/legacy`).set({ notes: "Private fixture", coordinates: { latitude: 50.123456, longitude: 14.123456 } });
  await db.doc(`socialPosts/fixture-${suffix}`).set({ ownerUid: ids.a, text: "Synthetic fixture only" });
  const commentPath = `socialPosts/fixture-${suffix}/comments/comment`;
  await db.doc(commentPath).set({ ownerUid: ids.b, text: "Preserve other owner's post" });
  await db.doc(`users/${ids.b}/socialReferences/comment`).set({ path: commentPath });
  const deletion = createAccountDeletionService({ db, auth, now: () => time, photoDeletion: { enqueue: async () => {} }, pageSize: 2 });
  await deletion.request(ids.b);
  await rejected(() => repo.getProfile(tokens.a, ids.b), "social_unavailable");
  await deletion.advanceOwner(ids.b, { maxSteps: 30, maxMillis: 20_000 });
  equal((await db.doc(`publicProfiles/${ids.b}`).get()).exists, false);
  equal((await db.doc(commentPath).get()).exists, false);
  equal((await db.doc(`socialPosts/fixture-${suffix}`).get()).exists, true);
  equal((await db.doc(`publicProfiles/${ids.a}`).get()).exists, true);
  equal((await db.collection("publicHandles").where("uid", "==", ids.b).get()).size, 0);
  equal((await db.doc(`crews/fixture-${suffix}`).get()).data().memberUids, [ids.a]);
  equal((await db.doc(`users/${ids.a}/catches/legacy`).get()).data().notes, "Unchanged private fixture");
  await auth.updateUser(ids.c, { disabled: true });
  await rejected(() => repo.getProfile(tokens.c, ids.a));
  console.log(`Social authenticated repository: ${checks} checks PASS`);
} finally {
  await db.doc("adminConfig/social").delete();
  await deleteApp(app);
}
