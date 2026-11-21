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
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `crew-${randomUUID()}`);
const db = getFirestore(app), auth = getAuth(app);
const ids = [], tokens = [];
let checks = 0, time = Date.now();
const config = db.doc("adminConfig/social"), prior = await config.get();
const service = createPublicProfileService({ db, auth, now: () => time, cursorSecret: "synthetic-crew-emulator-cursor-secret-key" });
const handler = createSocialHandler({ service, features: { crew: true } });
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
    const uid = `crew-${actor}-${randomUUID().slice(0, 8)}`;
    const email = `${uid}@example.test`, password = "Synthetic-Only-9!";
    ids.push(uid); await auth.createUser({ uid, email, password });
    const authentication = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    equal(authentication.status, 200); tokens.push((await authentication.json()).idToken);
  }
  const privateConfig = { crewEnabled: false };
  const input = { name: "<b>Skupina</b>", operationId: randomUUID() };
  await call(0, "crew.list", { mode: "member" }, 404, createSocialHandler({ service }));
  await config.set(privateConfig, { merge: true });
  await call(0, "crew.list", { mode: "member" }, 503);
  await config.set({ crewEnabled: true }, { merge: true });
  await call(-1, "crew.create", input, 401);
  await call(0, "crew.create", { ...input, ownerUid: ids[1] }, 400);
  await call(0, "crew.create", { ...input, name: "x".repeat(61) }, 400);
  const created = (await call(0, "crew.create", input)).crew;
  equal(created.visibility, "private");
  equal((await call(0, "crew.create", input)).crew.id, created.id);
  const crewId = created.id;
  const list = (actor, mode) => call(actor, "crew.list", { mode });
  const change = async (actor, operation, expectedRevision, fields = {}, status) => (await call(actor, "crew.change", { crewId, operation, expectedRevision, ...fields }, status)).crew;
  equal((await list(1, "public")).crews, []);
  await call(2, "crew.view", { crewId }, 404);
  await change(2, "accept", 1, {}, 404);
  await change(0, "invite", 1, { targetUid: ids[1] }, 404);
  const relation = db.doc(`socialRelationships/${canonicalPair(ids[0], ids[1])}`);
  await relation.set({ status: "accepted", memberUids: [ids[0], ids[1]], revision: 1 });
  const invited = await change(0, "invite", 1, { targetUid: ids[1] });
  equal((await list(1, "invited")).crews[0].role, "invited");
  await change(1, "accept", 1, {}, 409);
  const joined = await change(1, "accept", invited.revision);
  equal(joined.role, "member");
  await change(1, "transfer", joined.revision, { targetUid: ids[1] }, 403);
  await change(0, "leave", joined.revision, {}, 409);
  time += 60_000;
  const promoted = await change(0, "moderator", joined.revision, { targetUid: ids[1], enabled: true });
  const roster = (await call(0, "crew.view", { crewId })).crew;
  equal(roster.members.find(member => member.uid === ids[1]).moderator, true);
  await change(1, "visibility", promoted.revision, { visibility: "public" }, 403);
  const publiclyListed = await change(0, "visibility", promoted.revision, { visibility: "public" });
  const stranger = (await list(2, "public")).crews[0];
  equal(stranger.name, input.name);
  equal(stranger.members, undefined);
  const block = db.doc(`socialBlocks/${ids[0]}/blocked/${ids[2]}`);
  await block.set({ createdAt: time });
  equal((await list(2, "public")).crews, []);
  await call(2, "crew.report", { crewId, reason: "spam" }, 404);
  await block.delete();
  const newOwner = await change(0, "transfer", publiclyListed.revision, { targetUid: ids[1] });
  equal(newOwner.role, "member");
  equal((await list(1, "member")).crews[0].role, "owner");
  await change(0, "visibility", newOwner.revision, { visibility: "private" }, 403);
  const direct = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/crews/${crewId}`, {
    headers: { authorization: `Bearer ${tokens[1]}` },
  });
  equal(direct.status, 403);
  await call(2, "crew.report", { crewId, reason: "spam" });
  await call(2, "crew.report", { crewId, reason: "spam" });
  const reports = await db.collection("socialReports").where("reporterUid", "==", ids[2]).get();
  equal(reports.size, 1);
  await change(0, "leave", newOwner.revision);
  const remaining = (await list(1, "member")).crews[0];
  equal(remaining.memberCount, 1);
  const admin = createAdminService({ db, auth, ownerUid: ids[0], env: {}, now: () => time });
  const resolve = { action: "social.report.resolve", reportId: reports.docs[0].id, hide: true, status: "resolved", reason: "Místní kontrola" };
  await assert.rejects(admin.execute(resolve, await auth.verifyIdToken(tokens[2])), /forbidden/); checks++;
  await admin.execute(resolve, await auth.verifyIdToken(tokens[0]));
  equal((await list(2, "public")).crews, []);
  for (let i = 0; i < 5; i++) await call(2, "crew.report", { crewId, reason: "spam" }, 404);
  await call(2, "crew.report", { crewId, reason: "spam" }, 429);
  await db.doc(`accountDeletions/${ids[1]}`).set({});
  await call(1, "crew.list", { mode: "member" }, 403);
  for (let page = 0; page < 8 && await deleteSocialPage(db, ids[1]); page++) { /* bounded fixture cleanup */ }
  equal((await db.doc(`crews/${crewId}`).get()).exists, false);
  equal((await db.collection(`crews/${crewId}/audit`).get()).size, 0);
  console.log(`Crew emulator: ${checks} checks PASS`);
} finally {
  for (const uid of ids) { await db.doc(`accountDeletions/${uid}`).delete(); await auth.deleteUser(uid).catch(() => {}); }
  if (prior.exists) await config.set(prior.data()); else await config.delete();
  await app.delete();
}
