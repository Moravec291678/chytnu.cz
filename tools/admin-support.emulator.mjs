import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createAdminHandler } from "../src/features/admin/server/adminApi.js";
import { createAdminService } from "../src/features/admin/server/adminStore.js";
import { AdminPhotoResponse } from "../src/features/admin/server/adminPhotoProxy.js";
import { verifyFirebaseIdToken } from "../src/server/cloudinaryApi.js";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators required.");
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `support-${randomUUID()}`), db = getFirestore(app), auth = getAuth(app);
const suffix = randomUUID(), users = Object.fromEntries(["owner", "co", "staff", "user", "stranger"].map(role => [role, `support-${role}-${suffix}`])), tokens = {};
let checks = 0, time = Date.now(), duringPhoto = null;
const env = { CHYTNU_OWNER_UID: users.owner, CHYTNU_CO_CREATOR_UID: users.co };
const handler = createAdminHandler({ verifyToken: token => verifyFirebaseIdToken(auth, token), service: createAdminService({ db, auth, ownerUid: users.owner, env, now: () => time,
  photoProxy: async () => { await duringPhoto?.(); return new AdminPhotoResponse(new Uint8Array([255, 216, 255, 217])); } }) });
async function login(role) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${users[role]}@example.test`, password: `Synthetic-${suffix}-9!`, returnSecureToken: true }) });
  assert.equal(response.status, 200); tokens[role] = (await response.json()).idToken;
}
async function call(role, action, payload = {}, expected = 200) {
  const res = { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end(bytes) { this.bytes = bytes; return this; } };
  await handler({ method: "POST", headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}, body: { action, ...payload } }, res);
  assert.equal(res.statusCode, expected, `${action}: ${JSON.stringify(res.body)}`); checks++;
  return res.bytes ? res : res.body;
}
try {
  for (const [role, uid] of Object.entries(users)) { await auth.createUser({ uid, email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!`, displayName: `Support fixture ${role}` }); await login(role); }
  await call("anonymous", "support.own", {}, 401);
  await call("user", "support.open", { uid: users.stranger, category: "XP", description: "Synthetic case" }, 400);
  await call("user", "users.get", { uid: users.stranger }, 403);
  const c = await call("user", "support.open", { category: "Progression", description: "Synthetic support fixture. No real diary data." });
  assert.equal((await call("stranger", "support.own")).cases.length, 0);
  await call("staff", "support.cases", { uid: users.user }, 403);
  await call("owner", "users.update", { uid: users.staff, expectedRevision: 0, patch: { role: "ADMIN", permissions: ["users.read", "support", "moderation"] } });
  await call("owner", "users.update", { uid: users.co, expectedRevision: 0, patch: { permissions: ["users.read", "support"] } });
  await call("co", "users.update", { uid: users.co, expectedRevision: 1, patch: { permissions: ["users.manage"] } }, 403);
  await call("owner", "users.update", { uid: users.co, expectedRevision: 1, patch: { permissions: ["users.manage"] } }, 403);
  const privateCatch = { id: "private-fixture", ownerId: users.user, deleted: false, privacy: { visibility: "private", photoVisibility: "private" }, species: "Kapr", speciesKey: "commonCarp", caughtAt: new Date(time).toISOString(), lengthCm: 50, weightKg: 3, notes: "Secret fishing notes", waterName: "Secret water", coordinates: { latitude: 50.123456, longitude: 14.654321 }, photoRefs: { "photo-fixture": true } };
  await db.doc(`users/${users.user}/catches/private-fixture`).set(privateCatch);
  await db.doc(`users/${users.user}/catches/private-fixture/photos/photo-fixture`).set({ id: "photo-fixture", catchId: "private-fixture", ownerId: users.user, deleted: false, type: "image/jpeg", cloud: { state: "synced", objectKey: "private-object", provider: "cloudinary", sha256: "a".repeat(64) } });
  await db.doc(`users/${users.user}/catches/public-fixture`).set({ ...privateCatch, id: "public-fixture", privacy: { visibility: "public", photoVisibility: "private" } });
  await db.doc(`users/${users.user}/serverProgressionState/summary`).set({ ownerId: users.user, legacyBaselineXp: 100, serverEventXp: 0 });
  await db.doc(`users/${users.user}/serverProgressionEvents/original`).set({ ownerId: users.user, xp: 100, type: "catch.created" });
  const grantPayload = { caseId: c.caseId, categories: ["catches", "photos", "progression"], catchIds: ["private-fixture"], tripIds: [], photoRefs: [{ catchId: "private-fixture", photoId: "photo-fixture" }], hours: 1,
    snapshot: { baseXp: 100, achievements: [{ id: "first-catch", label: "První úlovek", xp: 50, completed: true }], rewards: [{ id: "reward", label: "catch.created", xp: 100, occurredAt: new Date(time).toISOString() }], challenges: [] } };
  await call("stranger", "support.grant", grantPayload, 403);
  await call("user", "support.grant", { ...grantPayload, hours: 100 }, 400);
  await call("user", "support.grant", { ...grantPayload, snapshot: { coordinates: { latitude: 1, longitude: 1 } } }, 400);
  const g = await call("user", "support.grant", grantPayload);
  const target = { uid: users.user, caseId: c.caseId, grantId: g.grantId };
  const data = await call("owner", "support.content", { ...target, category: "catches" });
  assert.equal(data.records.length, 1); assert.doesNotMatch(JSON.stringify(data), /Secret|latitude|longitude|objectKey|cloudinary/);
  await call("co", "support.content", { ...target, category: "catches" }, 403);
  await call("staff", "support.content", { ...target, category: "catches" }, 403);
  await call("owner", "support.content", { ...target, uid: users.stranger, category: "catches" }, 403);
  await call("owner", "support.content", { ...target, category: "trips" }, 403);
  const picture = await call("owner", "support.photo", { ...target, catchId: "private-fixture", photoId: "photo-fixture" });
  assert.equal(picture.headers["Content-Type"], "image/jpeg"); assert.equal(picture.bytes.length, 4);
  await call("owner", "support.photo", { uid: users.user, catchId: "private-fixture", photoId: "photo-fixture" }, 403);
  const publicPage = await call("owner", "users.public", { uid: users.user });
  assert.equal(publicPage.records.length, 1); assert.equal(publicPage.records[0].publicPhotos.length, 0); assert.doesNotMatch(JSON.stringify(publicPage), /latitude|Secret|private-fixture/);
  const p = await call("owner", "progression.preview", { ...target, delta: 50 }); assert.equal(p.summary.xp, 100); assert.equal(p.after, 150);
  const payload = { ...target, delta: 50, reason: "Verified synthetic correction", operationId: randomUUID(), expectedRevision: p.revision, expectedBaseXp: p.baseXp };
  await call("owner", "progression.adjust", payload); await call("owner", "progression.adjust", payload);
  await call("owner", "progression.adjust", { ...payload, delta: 51 }, 409);
  assert.equal((await call("user", "progression.self")).adjustmentXp, 50);
  assert.equal((await db.doc(`users/${users.user}/serverProgressionEvents/original`).get()).data().xp, 100);
  assert.equal((await db.collection(`users/${users.user}/adminProgressionAdjustments`).get()).size, 1);
  await call("staff", "progression.adjust", payload, 403);
  const earned = await call("owner", "support.content", { ...target, category: "progression" });
  assert.equal(earned.achievements[0].occurredAt, undefined); assert.equal(earned.summary.xp, 150);
  await call("owner", "support.case.save", { uid: users.user, caseId: c.caseId, expectedRevision: 1, status: "Investigating", priority: "normal", note: "Internal synthetic note", resolution: "" });
  assert.equal(JSON.stringify(await call("user", "support.own")).includes("Internal synthetic note"), false);
  assert.equal((await call("owner", "support.cases", { uid: users.user })).notes.length, 1);
  time += 3600001; await call("owner", "support.content", { ...target, category: "catches" }, 403); time -= 3600001;
  duringPhoto = async () => { await db.doc(`users/${users.user}/supportGrants/${g.grantId}`).update({ revokedAt: new Date(time).toISOString() }); };
  await call("owner", "support.photo", { ...target, catchId: "private-fixture", photoId: "photo-fixture" }, 403); duringPhoto = null;
  const next = await call("user", "support.grant", grantPayload);
  await call("user", "support.revoke", { grantId: next.grantId });
  await call("owner", "support.content", { ...target, grantId: next.grantId, category: "catches" }, 403);
  await call("owner", "moderation.set", { uid: users.user, catchId: "private-fixture", hidden: true, reason: "Synthetic moderation", expectedRevision: 0 }, 400);
  await call("owner", "moderation.set", { uid: users.user, catchId: "public-fixture", hidden: true, reason: "Synthetic public moderation", expectedRevision: 0 });
  assert.equal((await db.doc(`users/${users.user}/catches/public-fixture`).get()).data().deleted, false);
  assert.ok((await db.collection(`users/${users.user}/notifications`).get()).docs.some(doc => doc.data().type === "support"));
  const page = await call("owner", "users.list", { search: users.user }); assert.equal(page.users[0].uid, users.user);
  let indexed = await call("owner", "users.index");
  while (!indexed.complete) indexed = await call("owner", "users.index");
  const names = await call("owner", "users.list", { search: "Support fixture", searchMode: "name" }); assert.ok(names.users.some(u => u.uid === users.user));
  const meta = (await db.doc(`adminAccounts/${users.staff}`).get()).data();
  await db.doc(`adminAccounts/${users.staff}`).update({ permissionsExpiresAt: new Date(time-1000).toISOString() });
  await call("staff", "users.get", { uid: users.user }, 403);
  await db.doc(`adminAccounts/${users.staff}`).set(meta);
  await call("owner", "users.update", { uid: users.user, patch: { suspended: true }, expectedRevision: 0 }, 400);
  const suspension = await call("owner", "users.update", { uid: users.user, patch: { suspended: true, suspensionReason: "Synthetic account restriction" }, expectedRevision: 0 });
  await call("user", "support.own", {}, 401);
  await call("owner", "users.update", { uid: users.user, patch: { suspended: false }, expectedRevision: suspension.user.revision });
  await login("user"); assert.equal((await call("user", "support.own")).cases.length, 1);
  const audit = await call("owner", "users.history", { uid: users.user });
  assert.ok(audit.entries.some(e => e.action === "support.private.read")); assert.ok(audit.entries.some(e => e.action === "progression.adjust"));
  console.log(`Admin support integration passed: ${checks} authenticated checks; grants, expiration/revocation, private-read audit, GPS exclusion, photo fencing, XP idempotency, immutable rewards, moderation, notes, indexed names, suspension and permission expiry.`);
} finally { await deleteApp(app); }
