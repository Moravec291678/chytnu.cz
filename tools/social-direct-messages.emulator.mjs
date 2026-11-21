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
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `dm-${randomUUID()}`);
const db = getFirestore(app), auth = getAuth(app);
const ids = [], tokens = [];
let checks = 0, time = Date.now();
const config = db.doc("adminConfig/social"), prior = await config.get();
const service = createPublicProfileService({ db, auth, now: () => time, cursorSecret: "synthetic-dm-emulator-cursor-secret-key" });
const handler = createSocialHandler({ service, features: { directMessages: true } });
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
    const uid = `dm-${actor}-${randomUUID().slice(0, 8)}`;
    const email = `${uid}@example.test`, password = "Synthetic-Only-9!";
    ids.push(uid); await auth.createUser({ uid, email, password });
    const authentication = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    equal(authentication.status, 200); tokens.push((await authentication.json()).idToken);
  }
  const a = { targetUid: ids[0] }, b = { targetUid: ids[1] };
  const pair = canonicalPair(ids[0], ids[1]);
  const draft = { ...b, operationId: randomUUID(), text: "<img src=x onerror=alert(1)>" };
  await call(0, "dm.conversations", {}, 404, createSocialHandler({ service }));
  await config.set({ directMessagesEnabled: false }, { merge: true });
  await call(0, "dm.conversations", {}, 503);
  await config.set({ directMessagesEnabled: true }, { merge: true });
  await call(-1, "dm.send", draft, 401);
  await call(0, "dm.send", { ...draft, ownerUid: ids[2] }, 400);
  await call(0, "dm.send", { ...draft, text: "x".repeat(501) }, 400);
  await call(0, "dm.send", draft, 404);
  const relationship = db.doc(`socialRelationships/${pair}`);
  await relationship.set({ status: "accepted", memberUids: [ids[0], ids[1]], requestedBy: ids[0], revision: 1, createdAt: time, updatedAt: time });
  const retries = await Promise.all([call(0, "dm.send", draft), call(0, "dm.send", draft)]);
  equal(retries[0], retries[1]);
  const item = retries[0].message;
  await call(0, "dm.send", { ...draft, text: "other" }, 409);
  await call(2, "dm.list", a, 404);
  const received = await call(1, "dm.list", a);
  equal(received.messages, [{ ...item, mine: false }]);
  equal((await call(1, "dm.conversations")).conversations[0].unread, 1);
  const direct = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/privateConversations/${pair}/messages/${item.id}`, {
    headers: { authorization: `Bearer ${tokens[1]}` },
  });
  equal(direct.status, 403);
  await call(1, "dm.delete", { ...a, messageId: item.id }, 404);
  await call(1, "dm.read", { ...a, revision: 0 }, 409);
  await call(1, "dm.read", { ...a, revision: received.revision });
  equal((await call(1, "dm.conversations")).conversations[0].unread, 0);
  const report = { ...a, messageId: item.id, reason: "spam" };
  await call(1, "dm.report", report);
  await call(1, "dm.report", report);
  const reports = await db.collection("socialReports").where("reporterUid", "==", ids[1]).get();
  equal(reports.size, 1);
  const admin = createAdminService({ db, auth, ownerUid: ids[2], env: {}, now: () => time });
  const resolve = { action: "social.report.resolve", reportId: reports.docs[0].id, hide: true, status: "resolved", reason: "Místní kontrola" };
  await assert.rejects(admin.execute(resolve, await auth.verifyIdToken(tokens[1])), /forbidden/); checks++;
  await admin.execute(resolve, await auth.verifyIdToken(tokens[2]));
  equal((await call(1, "dm.list", a)).messages, []);
  await call(0, "dm.delete", { ...b, messageId: item.id });
  equal((await call(1, "dm.list", a)).messages, []);
  const last = await call(0, "dm.send", { ...draft, operationId: randomUUID(), text: "Poslední syntetická zpráva" });
  equal((await call(1, "dm.conversations")).conversations[0].unread, 1);
  const block = db.doc(`socialBlocks/${ids[1]}/blocked/${ids[0]}`);
  await block.set({ createdAt: time });
  await call(0, "dm.send", { ...draft, operationId: randomUUID() }, 404);
  await call(1, "dm.list", a, 404);
  equal((await call(1, "dm.conversations")).conversations, []);
  await block.delete();
  for (let i = 0; i < 15; i++) {
    if (i % 5 === 0) time += 60_000;
    await call(0, "dm.send", { ...draft, operationId: randomUUID(), text: `Stránkování ${i}` });
  }
  const page = await call(1, "dm.list", a);
  equal(page.messages.length, 15);
  const more = await call(1, "dm.list", { ...a, cursor: page.nextCursor });
  equal(more.messages, [{ ...last.message, mine: false }]);
  await call(0, "dm.list", { ...b, cursor: page.nextCursor }, 400);
  for (let i = 0; i < 3; i++) await call(0, "dm.send", { ...draft, operationId: randomUUID(), text: `Limit ${i}` });
  await call(0, "dm.send", { ...draft, operationId: randomUUID() }, 429);
  await db.doc(`accountDeletions/${ids[0]}`).set({});
  await call(1, "dm.list", a, 404);
  for (let page = 0; page < 8 && await deleteSocialPage(db, ids[0]); page++) { /* bounded fixture cleanup */ }
  equal((await db.doc(`privateConversations/${pair}`).get()).exists, false);
  equal((await db.collection(`privateConversations/${pair}/messages`).get()).size, 0);
  console.log(`Direct messages emulator: ${checks} checks PASS`);
} finally {
  for (const uid of ids) { await db.doc(`accountDeletions/${uid}`).delete(); await auth.deleteUser(uid).catch(() => {}); }
  if (prior.exists) await config.set(prior.data()); else await config.delete();
  await app.delete();
}
