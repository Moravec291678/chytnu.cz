// Synthetic local accounts only; never run against production.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { createPublicProfileService } from "../src/features/social/server/publicProfileService.js";
import { createSocialHandler } from "../src/features/social/server/socialApi.js";
import { createAdminProgressionReconciler } from "../src/server/progressionApi.js";
import { canonicalPair } from "../src/features/social/data/socialModel.js";
import { summaryForXp } from "../src/features/progression/data/progressionSummary.js";
import { moderationKey } from "../src/features/admin/server/adminSupportStore.js";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local Auth/Firestore emulators required");
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `social-progression-${randomUUID()}`), db = getFirestore(app), auth = getAuth(app);
const suffix = randomUUID().replaceAll("-", "").slice(0, 8), ids = {}, tokens = {}, profiles = {};
let checks = 0, time = Date.now(), requests = 0;
const env = {}, makeHandler = () => createSocialHandler({ service: createPublicProfileService({ db, auth, avatar: {}, env, now: () => time,
  cursorSecret: "synthetic-progression-cursor-secret-over-32-chars" }) });
let handler = makeHandler();
function equal(a, b) { assert.deepEqual(a, b); checks++; }
function safe(value) {
  assert.doesNotMatch(JSON.stringify(value), /SECRET|latitude|longitude|legacyBaselineXp|photoHash|sourceCatchId|reasonKey|sourceEntityId|ownerId/); checks++;
}
async function call(role, action, payload = {}, expected = 200) {
  if (++requests % 20 === 0) time += 60_000;
  const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "POST", headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}, body: { action, ...payload } }, res);
  assert.equal(res.statusCode, expected, `${role}/${action}: ${JSON.stringify(res.body)}`); checks++; return res.body;
}
const view = async (role, target = "a") => (await call(role, "view", { identity: ids[target] })).profile;
async function save(role, patch) {
  const profile = { ...profiles[role], ...patch };
  const value = await call(role, "save", { profile }); profiles[role] = profile; return value;
}
async function direct(role, path, method = "GET", body) {
  return fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/${path}`, {
    method, headers: { ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
try {
  for (const role of ["a", "b", "c", "owner", "co"]) {
    const uid = `social-progression-${role}-${suffix}`; ids[role] = uid;
    await auth.createUser({ uid, email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!` });
    const signed = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!`, returnSecureToken: true }),
    });
    equal(signed.status, 200); tokens[role] = (await signed.json()).idToken;
    profiles[role] = { handle: `${role}_${suffix}`, displayName: `Synthetic progression ${role}`, visibility: "public", discoverable: true };
    await save(role, {});
  }
  env.CHYTNU_OWNER_UID = ids.owner; env.CHYTNU_CO_CREATOR_UID = ids.co; handler = makeHandler();
  const events = db.collection(`users/${ids.a}/serverProgressionEvents`), summaryRef = db.doc(`users/${ids.a}/serverProgressionState/summary`);
  // Existing server event format and existing reconciler; no social reward issuer.
  for (let i = 0; i < 12; i++) {
    const id = `catch-created-synthetic${i}`;
    await events.doc(id).set({ id, eventId: id, ownerId: ids.a, catchId: `synthetic${i}`, type: "catch.created", xp: 10,
      verificationLevel: "standard", photoHash: "a".repeat(64), source: "server-shadow", schemaVersion: 1, createdAt: Timestamp.fromMillis(time) });
  }
  const reconcile = createAdminProgressionReconciler(db, () => Timestamp.fromMillis(time));
  await reconcile(ids.a, { localProgressionXp: 10120, pendingCatchXp: 0 });
  const historicalSummary = (await summaryRef.get()).data(), historicalEvents = (await events.get()).docs.map(row => ({ id: row.id, ...row.data() }));
  equal(historicalSummary.serverEventXp, 120); equal(historicalSummary.legacyBaselineXp, 10000);
  await db.doc(`users/${ids.a}/catches/private`).set({ id: "private", ownerId: ids.a, species: "SECRET-SPECIES", lengthCm: 199,
    notes: "SECRET-NOTE", coordinates: { latitude: 50.123456, longitude: 14.654321 } });
  equal((await view("anonymous")).progression, undefined); // Private sections remain default.
  const choices = (await call("a", "self")).achievementChoices;
  assert.ok(choices.length > 0); checks++;
  assert.equal(choices.some(item => ["night-catch", "marathon-trip"].includes(item.id)), false); checks++;
  for (const choice of choices) {
    equal(choice.source, "unverified"); equal(choice.unlockedAt, null); equal(choice.rewardGranted, false);
  }
  for (const extra of [{ xp: 9999999 }, { level: 100 }, { progression: { xp: 9999999, source: "server" } }, { badgeRole: "OWNER" }]) {
    await call("a", "save", { profile: { ...profiles.a, ...extra } }, 400);
  }
  await call("a", "save", { profile: { ...profiles.a, sharedAchievementIds: ["night-catch"] } }, 400);
  await call("a", "save", { profile: { ...profiles.a, sharedAchievementIds: ["unknown"] } }, 400);
  await call("a", "save", { profile: { ...profiles.a, sharedAchievementIds: ["first-catch", "first-catch"] } }, 400);
  await save("a", { sections: { achievements: "public" }, sharedAchievementIds: ["first-catch", "five-species"] });
  let publicView = await view("anonymous"); safe(publicView);
  equal(publicView.progression.xp, 120); equal(publicView.progression.level, summaryForXp(120).level);
  equal(publicView.progression.rank, summaryForXp(120).rank.name); equal(publicView.progression.version, 1);
  equal(publicView.progression.source, "server"); equal(publicView.progression.scope, "server-events-only");
  equal(publicView.achievements.map(item => item.id), ["first-catch", "five-species"]);
  assert.ok(publicView.achievements.every(item => item.verified === false && item.source === "unverified" && item.unlockedAt === null && !item.rewardGranted)); checks++;
  // Statistics and PB use only explicitly shared fields, not private diary totals.
  const approvedCatch = { id: "approved", ownerId: ids.a, species: "Kapr", caughtAt: new Date(time).toISOString(), lengthCm: 53, weightKg: 3.2,
    weightSource: "manual", privacy: { visibility: "private", photoVisibility: "private" }, notes: "SECRET-APPROVED-NOTE", coordinates: { latitude: 49, longitude: 15 } };
  await db.doc(`users/${ids.a}/catches/approved`).set(approvedCatch);
  await db.doc(`users/${ids.a}/catches/hidden`).set({ ...approvedCatch, id: "hidden", species: "Štika", lengthCm: 100 });
  const publication = { catchId: "approved", visibility: "public", photoId: null, description: "Explicit selected measurements", fields: { length: true, date: "month" }, expectedRevision: 0 };
  let publicPost = (await call("a", "posts.save", publication)).post;
  await call("a", "posts.save", { ...publication, catchId: "hidden", visibility: "private" });
  await save("a", { sections: { achievements: "public", statistics: "public", trophies: "public", catches: "public" }, sharedCatchIds: ["approved"] });
  const sharedStats = await view("anonymous"); safe(sharedStats);
  equal(sharedStats.statistics.catchCount, 1); equal(sharedStats.statistics.source, "shared"); equal(sharedStats.statistics.version, 1);
  equal(sharedStats.statistics.speciesCount, 1); equal(sharedStats.statistics.speciesCounts, [{ species: "Kapr", count: 1 }]);
  equal(sharedStats.statistics.longestCm, 53); equal(sharedStats.statistics.heaviestKg, null); equal(sharedStats.trophies.length, 1);
  equal(sharedStats.trophies[0].lengthCm, 53); equal(sharedStats.trophies[0].weightKg, undefined);
  equal(sharedStats.trophies[0].caughtAt, approvedCatch.caughtAt.slice(0, 7));
  // Same source in selected legacy catches + a post counts once, with the post's narrower approval.
  publicPost = (await call("a", "posts.save", { ...publication, fields: {}, expectedRevision: publicPost.revision })).post;
  equal((await view("anonymous")).statistics.longestCm, null); equal((await view("anonymous")).trophies, []);
  publicPost = (await call("a", "posts.save", { ...publication, fields: { length: true, weight: true }, expectedRevision: publicPost.revision })).post;
  equal((await view("anonymous")).statistics.heaviestKg, 3.2);
  const moderation = db.doc(`adminPublicModeration/${moderationKey(ids.a, "approved")}`);
  await moderation.set({ hidden: true }); equal((await view("anonymous")).statistics.catchCount, 0); await moderation.delete();
  await save("a", { sharedCatchIds: [] });
  await call("a", "posts.delete", { postId: publicPost.id, expectedRevision: publicPost.revision });
  equal((await view("anonymous")).statistics.catchCount, 0); equal((await db.doc(`users/${ids.a}/catches/approved`).get()).data(), approvedCatch);
  const secondDevice = makeHandler(); handler = secondDevice;
  equal((await view("b")).progression, publicView.progression);
  equal((await view("b")).achievements, publicView.achievements);
  for (const role of ["a", "b", "owner", "co", "anonymous"]) {
    for (const path of [`users/${ids.a}/serverProgressionState/summary`, `users/${ids.a}/serverProgressionEvents/forged`]) {
      equal((await direct(role, path, "PATCH", { fields: { ownerId: { stringValue: ids.a }, serverEventXp: { integerValue: "9999999" }, xp: { integerValue: "9999999" } } })).status, 403);
    }
  }
  for (const role of ["b", "owner", "co", "anonymous"]) equal((await direct(role, `users/${ids.a}/serverProgressionState/summary`)).status, 403);
  equal((await direct("a", `users/${ids.a}/serverProgressionState/summary`)).status, 200);
  equal((await direct("a", `users/${ids.a}/progressionEvents/forged`, "PATCH", { fields: { type: { stringValue: "achievement.unlocked" }, xp: { integerValue: "9999999" } } })).status, 403);
  equal((await summaryRef.get()).data(), historicalSummary); equal((await events.get()).docs.map(row => ({ id: row.id, ...row.data() })), historicalEvents);
  await save("a", { sections: { achievements: "friends" } });
  equal((await view("anonymous")).progression, undefined); equal((await view("b")).progression, undefined);
  equal((await view("owner")).progression, undefined); equal((await view("co")).progression, undefined);
  const pair = db.doc(`socialRelationships/${canonicalPair(ids.a, ids.b)}`);
  await pair.set({ requestedBy: ids.a, memberUids: [ids.a, ids.b], status: "accepted", createdAt: time, updatedAt: time, revision: 1 });
  equal((await view("b")).progression.xp, 120); equal((await view("c")).progression, undefined);
  equal((await call("a", "preview", { audience: "stranger" })).profile.progression, undefined);
  equal((await call("a", "preview", { audience: "friend" })).profile.progression.xp, 120);
  await call("anonymous", "progression.compare", { targetUid: ids.a }, 401);
  await call("c", "progression.compare", { targetUid: ids.a }, 404);
  await call("b", "progression.compare", { targetUid: ids.a, uid: ids.owner }, 400);
  const comparison = await call("b", "progression.compare", { targetUid: ids.a }); safe(comparison);
  equal(comparison.profiles.length, 2); equal(comparison.profiles.find(item => item.uid === ids.a).progression.xp, 120);
  equal(comparison.profiles.find(item => item.uid === ids.a).statistics, undefined);
  equal(comparison.profiles.find(item => item.uid === ids.b).statistics, undefined); // Viewer never gets its owner-only fields in the friend comparison.
  await pair.update({ status: "unfriended" }); await call("b", "progression.compare", { targetUid: ids.a }, 404);
  equal((await view("b")).progression, undefined);
  await pair.update({ status: "accepted" }); await call("b", "block", { targetUid: ids.a, blocked: true });
  await call("b", "progression.compare", { targetUid: ids.a }, 404); await call("b", "view", { identity: ids.a }, 404);
  await call("b", "block", { targetUid: ids.a, blocked: false });
  await save("a", { sections: { achievements: "private" } });
  equal((await view("anonymous")).achievements, undefined); equal((await view("owner")).progression, undefined);
  await save("a", { sections: { achievements: "public" }, sharedAchievementIds: [] });
  equal((await view("anonymous")).achievements, []); // Never infer awards from private catches or reward events.
  await save("b", { sections: { achievements: "public" }, sharedAchievementIds: ["ten-catches"] });
  equal((await view("anonymous", "b")).progression, undefined); // Missing summary does not manufacture XP/level.
  equal((await view("anonymous", "b")).achievements[0].source, "unverified");
  await db.doc(`publicProfiles/${ids.a}`).update({ sharedAchievementIds: FieldValue.delete() });
  equal((await view("anonymous")).achievements, []); // Legacy profile remains readable without new metadata.
  for (const [role, badge] of [["owner", "OWNER"], ["co", "CO_CREATOR"]]) equal((await view("anonymous", role)).badgeRole, badge);
  await save("a", { visibility: "private" }); equal(await view("anonymous"), null);
  await save("a", { visibility: "public" });
  await db.doc(`accountDeletions/${ids.a}`).set({ ownerUid: ids.a, status: "requested" }); equal(await view("anonymous"), null);
  equal((await summaryRef.get()).data(), historicalSummary); equal((await events.get()).docs.map(row => ({ id: row.id, ...row.data() })), historicalEvents);
  equal((await db.doc(`users/${ids.a}/catches/private`).get()).data().notes, "SECRET-NOTE");
  console.log(`Social progression: ${checks} real Auth/Firestore visibility, XP authority, unverified local claims, comparison and historical-integrity checks PASS; 5 accounts`);
} finally { await deleteApp(app); }
