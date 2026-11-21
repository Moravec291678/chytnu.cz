import catalogue from "../public/data/ris/be90ad549cf77679/index.json" with { type: "json" };
// Synthetic fixtures. Always run against disposable Auth and Firestore emulators.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createPublicProfileService } from "../src/features/social/server/publicProfileService.js";
import { createSocialHandler } from "../src/features/social/server/socialApi.js";
import { canonicalPair } from "../src/features/social/data/socialModel.js";
import { deleteSocialPage } from "../src/features/social/server/socialDeletion.js";
import { createAdminService } from "../src/features/admin/server/adminStore.js";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local Auth/Firestore emulators required");
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `water-content-${randomUUID()}`);
const db = getFirestore(app), auth = getAuth(app);
const ids = [], tokens = [];
let checks = 0, time = Date.now();
const config = db.doc("adminConfig/social"), prior = await config.get();
const service = createPublicProfileService({ db, auth, now: () => time, cursorSecret: "synthetic-water-content-emulator-cursor-secret-key" });
const handler = createSocialHandler({ service, features: { waterCommunity: true } });
async function call(actor, action, payload = {}, expected = 200, serve = handler) {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const headers = tokens[actor] ? { authorization: `Bearer ${tokens[actor]}` } : {};
  await serve({ method: "POST", headers, body: { ...payload, action } }, response);
  assert.equal(response.statusCode, expected, `${actor}/${action}: ${JSON.stringify(response.body)}`); checks++;
  return response.body;
}
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }

try {
  for (let actor = 0; actor < 3; actor++) {
    const uid = `water-content-${actor}-${randomUUID().slice(0, 8)}`;
    const email = `${uid}@example.test`, password = "Synthetic-Only-9!";
    ids.push(uid); await auth.createUser({ uid, email, password });
    const authentication = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    equal(authentication.status, 200); tokens.push((await authentication.json()).idToken);
  }
  const water = catalogue.at(-1), other = catalogue.at(-2);
  const query = { catalogueId: water.id };
  await call(0, "waterCommunity.list", query, 404, createSocialHandler({ service }));
  await config.set({ waterCommunityEnabled: false }, { merge: true });
  await call(0, "waterCommunity.list", query, 503);
  await config.set({ waterCommunityEnabled: true }, { merge: true });
  await call(-1, "waterCommunity.list", query, 401);
  await call(0, "waterCommunity.list", { catalogueId: "personal-water" }, 400);
  await call(0, "waterCommunity.list", { ...query, longitude: 15 }, 400);
  const profile = { handle: ids[0].replaceAll("-", "_"), displayName: "Syntetický rybář", visibility: "public", sections: { catches: "public" } };
  await call(0, "save", { profile, publicationConsent: { version: 1, mode: "public", expectedEpoch: 0 } });
  const personal = db.doc(`users/${ids[0]}/waters/personal-water`);
  await personal.set({ ownerId: ids[0], catalogueId: water.id, name: "PRIVATE_WATER", coordinates: { latitude: 50.123456, longitude: 15.234567 } });
  const realPosts = new Set();
  for (let i = 0; i < 14; i++) {
    if (i % 4 === 0) time += 60_000;
    const catchId = `catch-${i}`;
    await db.doc(`users/${ids[0]}/catches/${catchId}`).set({ ownerId: ids[0], species: "Kapr", waterId: "personal-water",
      caughtAt: new Date(time).toISOString(), notes: "PRIVATE_NOTE", gps: { latitude: 50.123456, longitude: 15.234567 } });
    if (i === 13) continue;
    const row = await call(0, "posts.save", { catchId, photoId: null, visibility: i === 12 ? "private" : "public",
      fields: { water: i < 11 || i === 12, date: "month" }, description: "Výslovně sdílený revír.", expectedRevision: 0 });
    if (i < 11) realPosts.add(row.post.id);
  }
  const first = await call(1, "waterCommunity.list", query);
  assert.ok(first.posts.length >= 9 && first.posts.length <= 10); checks++;
  assert.ok(first.nextCursor); checks++;
  await call(2, "waterCommunity.list", { ...query, cursor: first.nextCursor }, 400);
  await call(1, "waterCommunity.list", { catalogueId: other.id, cursor: first.nextCursor }, 400);
  const next = await call(1, "waterCommunity.list", { ...query, cursor: first.nextCursor });
  equal(next.nextCursor, null);
  const all = first.posts.concat(next.posts);
  equal(new Set(all.map(post => post.id)), realPosts);
  assert.doesNotMatch(JSON.stringify(all), /PRIVATE_|latitude|longitude|sourceCatchId|sourcePhotoId|objectKey|personal-water/); checks++;
  const reported = all[0].id;
  await call(1, "reports.create", { postId: reported, reason: "privacy" });
  const report = (await db.collection("socialReports").where("reporterUid", "==", ids[1]).get()).docs[0];
  const admin = createAdminService({ db, auth, ownerUid: ids[2], env: {}, now: () => time });
  const resolve = { action: "social.report.resolve", reportId: report.id, hide: true, status: "resolved", reason: "Místní kontrola" };
  await assert.rejects(admin.execute(resolve, await auth.verifyIdToken(tokens[1])), /forbidden/); checks++;
  await admin.execute(resolve, await auth.verifyIdToken(tokens[2]));
  equal((await call(1, "waterCommunity.list", query)).posts.some(post => post.id === reported), false);
  const block = db.doc(`socialBlocks/${ids[0]}/blocked/${ids[1]}`);
  await block.set({ createdAt: time });
  equal((await call(1, "waterCommunity.list", query)).posts, []);
  await block.delete();
  await personal.update({ catalogueId: other.id });
  equal((await call(1, "waterCommunity.list", query)).posts, []);
  await call(1, "waterCommunity.list", query, 429);
  await personal.update({ catalogueId: water.id });
  await call(0, "save", { profile: { ...profile, visibility: "private" }, publicationConsent: { version: 1, mode: "private", expectedEpoch: 1 } });
  time += 60_000;
  equal((await call(1, "waterCommunity.list", query)).posts, []);
  const direct = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/socialPosts/${reported}`, { headers: { authorization: `Bearer ${tokens[1]}` } });
  equal(direct.status, 403);
  console.log(`Water community emulator: ${checks} checks PASS`);
} finally {
  for (const uid of ids) { await db.doc(`accountDeletions/${uid}`).delete(); await auth.deleteUser(uid).catch(() => {}); }
  if (prior.exists) await config.set(prior.data()); else await config.delete();
  await app.delete();
}
