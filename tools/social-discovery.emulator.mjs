import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createPublicProfileService } from "../src/features/social/server/publicProfileService.js";
import { createSocialHandler } from "../src/features/social/server/socialApi.js";
import { createSocialRepository } from "../src/features/social/server/socialRepository.js";
import { reindexDiscoveryPage } from "../src/features/social/server/discoveryBackfill.js";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators only");
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `discovery-${randomUUID()}`), db = getFirestore(app), auth = getAuth(app);
let time = Date.now(), checks = 0;
const suffix = randomUUID().replaceAll("-", "").slice(0,8), ids = {}, tokens = {}, profiles = {};
const repo = createSocialRepository({ db, auth, now: () => time, profilesEnabled: true });
let handler;
function equal(a,b) { assert.deepEqual(a,b); checks++; }
async function account(role) {
  const uid = `discovery-${role}-${suffix}`; ids[role] = uid;
  await auth.createUser({ uid, email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!` });
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!`, returnSecureToken: true }) });
  assert.equal(res.status, 200); tokens[role] = (await res.json()).idToken;
}
async function call(role, action, payload = {}, expected = 200) {
  const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "POST", headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}, body: { action, ...payload } }, res);
  equal(res.statusCode, expected); return res.body;
}
async function allPages(role, request) {
  const rows = []; let cursor = null, pages = 0, firstCursor = null;
  do { const page = await call(role, "search", { ...request, cursor });
    assert.ok(page.users.length <= 10); checks++;
    rows.push(...page.users); cursor = page.nextCursor; firstCursor ??= cursor;
    if (++pages > 10) throw new Error("Unbounded pagination");
  } while (cursor);
  equal(new Set(rows.map(r => r.uid)).size, rows.length);
  return { rows, firstCursor };
}
try {
  await account("viewer"); await account("stranger");
  profiles.viewer = { handle: `viewer_${suffix}`, displayName: "Hledající rybář", visibility: "public", discoverable: true };
  await repo.saveProfile(tokens.viewer, profiles.viewer);
  for (let i = 0; i < 18; i++) {
    const role = `u${String(i).padStart(2,"0")}`; await account(role);
    profiles[role] = { handle: `angler${String(i).padStart(2,"0")}_${suffix}`, displayName: i < 2 ? "Jiří Novák" : `Rybář Číslo ${i}`,
      visibility: "public", discoverable: true, directoryDiscoverable: true, regionDiscoverable: i !== 3, region: "Jižní Morava", specialization: "Feeder", favoriteSpecies: "Kapr",
      bio: "PRIVATE-BIO", sections: { interests: i === 4 ? "friends" : "public", achievements: "public" } };
    if (i === 5) profiles[role].visibility = "private";
    if (i === 6) profiles[role].visibility = "friends";
    if (i === 7) profiles[role].discoverable = false;
    await repo.saveProfile(tokens[role], profiles[role]);
  }
  handler = createSocialHandler({ service: createPublicProfileService({ db, auth, avatar: {}, now: () => time,
    env: { CHYTNU_OWNER_UID: ids.u00, CHYTNU_CO_CREATOR_UID: ids.u01 }, cursorSecret: "synthetic-emulator-cursor-secret-32-plus-characters" }) });
  const privateCatch = { ownerId: ids.u00, species: "Kapr", lengthCm: 55, caughtAt: new Date(time).toISOString(), notes: "PRIVATE-CATCH", coordinates: { latitude: 50.123456, longitude: 14.654321 } };
  await db.doc(`users/${ids.u00}/catches/fixture`).set(privateCatch);
  await db.doc(`users/${ids.u00}/catches/fixture/photos/photo`).set({ ownerId: ids.u00, type: "image/jpeg", cloud: { state: "synced" } });
  Object.assign(profiles.u00, { sharedCatchIds: ["fixture"], sharedPhotos: [{ catchId: "fixture", photoId: "photo" }] });
  Object.assign(profiles.u00.sections, { catches: "public", gallery: "public", statistics: "public" });
  await repo.saveProfile(tokens.u00, profiles.u00);
  await repo.block(tokens.u09, ids.viewer); // Last candidate on a full scanned page is hidden.
  await db.doc(`accountSuspensions/${ids.u08}`).set({ suspended: true });
  await call("anonymous", "search", { query: "angler" }, 401);
  await call("viewer", "search", { query: "a" }, 400);
  await call("viewer", "search", { query: "angler", uid: ids.u00 }, 400);
  await call("viewer", "search", { query: "angler", latitude: 50 }, 400);
  const exact = await call("viewer", "search", { query: profiles.u00.handle.toUpperCase() });
  equal(exact.users.map(p => p.uid), [ids.u00]); equal(exact.users[0].badgeRole, "OWNER");
  equal(exact.users[0].catches, undefined); equal(exact.users[0].photos, undefined); equal(exact.users[0].statistics, undefined);
  for (const role of ["u05", "u06", "u07", "u08", "u09"]) equal((await call("viewer", "search", { query: profiles[role].handle })).users, []);
  const partial = await allPages("viewer", { query: `angler` });
  equal(partial.rows.length, 13); // 18 minus private/friends/unlisted/suspended/blocked.
  assert.ok(partial.firstCursor); checks++;
  assert.doesNotMatch(Buffer.from(partial.firstCursor, "base64url").toString(), new RegExp(`${ids.u09}|${profiles.u09.handle}`)); checks++;
  assert.doesNotMatch(JSON.stringify(partial.rows), /PRIVATE-BIO|email|latitude|longitude|searchPrefixes|avatarAssetId|sharedPhotos/); checks++;
  const duplicate = await call("viewer", "search", { query: "JIRI NOV" });
  equal(duplicate.users.length, 2); equal(new Set(duplicate.users.map(p => p.handle)).size, 2);
  equal(duplicate.users.find(p => p.uid === ids.u01).badgeRole, "CO_CREATOR");
  const interests = await allPages("viewer", { query: "fee", field: "interests" });
  equal(interests.rows.some(p => p.uid === ids.u04), false);
  const region = await allPages("viewer", { query: "JIZNI MOR", field: "region" });
  equal(region.rows.some(p => p.uid === ids.u03 || p.uid === ids.u04), false);
  equal((await call("viewer", "search", { query: profiles.u03.handle })).users[0].region, undefined);
  const newest = await allPages("viewer", { mode: "new", query: "", field: "all" });
  equal(newest.rows.length, 13); // Identical timestamps use UID as a stable tiebreaker.
  equal(newest.rows.map(p => p.uid), [...newest.rows.map(p => p.uid)].sort());
  await call("stranger", "search", { query: "angler", cursor: partial.firstCursor }, 400);
  await call("viewer", "search", { query: "feeder", cursor: partial.firstCursor }, 400);
  const tampered = `${partial.firstCursor.slice(0,20)}${partial.firstCursor[20] === "X" ? "Y" : "X"}${partial.firstCursor.slice(21)}`;
  await call("viewer", "search", { query: "angler", cursor: tampered }, 400);
  await call("stranger", "relationship", { targetUid: ids.u00, operation: "request" }, 409);
  equal((await call("viewer", "relationship", { targetUid: ids.u00, operation: "request" })).relationship.status, "outgoing");
  equal((await call("u00", "search", { query: profiles.viewer.handle })).users[0].relationship.status, "incoming");
  // Turning discovery off does not invalidate an already offered invitation.
  await repo.saveProfile(tokens.viewer, { ...profiles.viewer, discoverable: false });
  equal((await call("u00", "relationship", { targetUid: ids.viewer, operation: "accept" })).relationship.status, "friends");
  await repo.saveProfile(tokens.viewer, profiles.viewer);
  equal((await call("viewer", "search", { query: profiles.u00.handle })).users[0].relationship.status, "friends");
  await call("viewer", "relationship", { targetUid: ids.u09, operation: "request" }, 404);
  await call("viewer", "relationship", { targetUid: ids.u05, operation: "request" }, 404);
  await call("stranger", "relationship", { targetUid: ids.u00, operation: "accept" }, 400);
  const originalHandle = profiles.u00.handle;
  profiles.u00.handle = `renamed_${suffix}`; await repo.saveProfile(tokens.u00, profiles.u00);
  equal((await call("viewer", "search", { query: originalHandle })).users.length, 0);
  equal((await call("viewer", "search", { query: profiles.u00.handle })).users[0].uid, ids.u00);
  await call("viewer", "save", { profile: { handle: originalHandle, displayName: "Thief" } }, 409);
  const source = (await db.doc(`publicProfiles/${ids.u02}`).get()).data();
  // Seed true legacy shape without changing consent or private source records.
  const legacy = { ...source }; delete legacy.searchPrefixes; delete legacy.discoveryIndexVersion; delete legacy.directoryDiscoverable; delete legacy.regionDiscoverable;
  await db.doc(`publicProfiles/${ids.u02}`).set(legacy);
  let cursor = null, updated = 0;
  do { const page = await reindexDiscoveryPage({ db, cursor, now: () => time }); updated += page.updated; cursor = page.nextCursor; } while (cursor);
  assert.ok(updated > 0); checks++;
  const migrated = (await db.doc(`publicProfiles/${ids.u02}`).get()).data(), before = { ...migrated }; delete before.searchPrefixes; delete before.discoveryIndexVersion;
  equal(before, legacy); equal(migrated.searchPrefixes.includes("directory:new"), false);
  equal((await call("viewer", "search", { query: profiles.u02.handle })).users[0].uid, ids.u02);
  let secondUpdated = 0; cursor = null;
  do { const page = await reindexDiscoveryPage({ db, cursor, now: () => time }); secondUpdated += page.updated; cursor = page.nextCursor; } while (cursor);
  equal(secondUpdated, 0);
  time += 16 * 60_000;
  await call("viewer", "search", { query: "angler", cursor: partial.firstCursor }, 400);
  await db.doc("adminConfig/social").set({ discoveryEnabled: false });
  await call("viewer", "search", { query: "angler" }, 503); await db.doc("adminConfig/social").delete();
  await db.doc(`serverRateLimits/social-search-${createHash("sha256").update(ids.viewer).digest("hex")}`).set({ window: Math.floor(time / 60_000), count: 30 });
  await call("viewer", "search", { query: "angler" }, 429);
  equal((await db.doc(`users/${ids.u00}/catches/fixture`).get()).data(), privateCatch);
  console.log(`Social discovery: ${checks} Auth/Firestore search/privacy/pagination checks PASS; 20 real emulator accounts`);
} finally { await db.doc("adminConfig/social").delete(); await deleteApp(app); }
