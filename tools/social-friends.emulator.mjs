// Synthetic accounts only. Never point this acceptance suite at production.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createPublicProfileService } from "../src/features/social/server/publicProfileService.js";
import { createSocialHandler } from "../src/features/social/server/socialApi.js";
import { createSocialRepository } from "../src/features/social/server/socialRepository.js";
import { canonicalPair } from "../src/features/social/data/socialModel.js";
import { assertSocialInteraction } from "../src/features/social/server/socialAccess.js";
import { createAccountDeletionService } from "../src/server/accountDeletion.js";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local Auth/Firestore emulators required");
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `friends-${randomUUID()}`), db = getFirestore(app), auth = getAuth(app);
const suffix = randomUUID().replaceAll("-", "").slice(0, 8), ids = {}, tokens = {};
let checks = 0, time = Date.now();
const env = {}, repo = createSocialRepository({ db, auth, profilesEnabled: true, now: () => time });
const makeHandler = () => createSocialHandler({ service: createPublicProfileService({ db, auth, avatar: {}, env, now: () => time,
  cursorSecret: "synthetic-friends-emulator-cursor-key-over-32-characters" }) });
let handler;
function equal(a, b) { assert.deepEqual(a, b); checks++; }
async function call(role, action, payload = {}, expected = 200) {
  const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "POST", headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}, body: { action, ...payload } }, response);
  assert.equal(response.statusCode, expected, `${role}/${action}: ${JSON.stringify(response.body)}`); checks++;
  return response.body;
}
const op = () => randomUUID();
const act = (role, target, operation, extra = {}, expected = 200) => call(role, "relationship", { targetUid: ids[target], operation, operationId: op(), ...extra }, expected);
const status = async (role, target) => (await call(role, "friends.status", { targetUid: ids[target] })).relationship;
async function listed(role, tab, target) {
  const page = await call(role, "friends", { tab });
  assert.ok(Array.isArray(page.users) && page.users.length <= 10); checks++;
  assert.doesNotMatch(JSON.stringify(page), /PRIVATE-CATCH|latitude|longitude|email|permissions|avatarAssetId/); checks++;
  return page.users.some(user => user.uid === ids[target]);
}
async function direct(role, path, method = "GET", body) {
  return fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/${path}`, {
    method, headers: { Authorization: `Bearer ${tokens[role]}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function deniedInteraction(role, target, requireFriend) {
  await assert.rejects(() => db.runTransaction(tx => assertSocialInteraction({ tx, db, uid: ids[role], targetUid: ids[target], requireFriend })), /social_unavailable/); checks++;
}
try {
  for (const role of ["a", "b", "c", "owner", "co"]) {
    const uid = `friends-${role}-${suffix}`; ids[role] = uid;
    await auth.createUser({ uid, email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!` });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@example.test`, password: `Synthetic-${suffix}-9!`, returnSecureToken: true }),
    });
    equal(response.status, 200); tokens[role] = (await response.json()).idToken;
    await repo.saveProfile(tokens[role], { handle: `${role}_${suffix}`, displayName: `Synthetic friend ${role.toUpperCase()}`, visibility: "public", discoverable: true });
  }
  env.CHYTNU_OWNER_UID = ids.owner; env.CHYTNU_CO_CREATOR_UID = ids.co; handler = makeHandler();
  const pair = canonicalPair(ids.a, ids.b), pairRef = db.doc(`socialRelationships/${pair}`);
  const privateCatch = { ownerId: ids.b, notes: "PRIVATE-CATCH", coordinates: { latitude: 50.123456, longitude: 14.654321 } };
  await db.doc(`users/${ids.b}/catches/private`).set(privateCatch);
  await call("anonymous", "friends", { tab: "friends" }, 401);
  await call("anonymous", "relationship", { targetUid: ids.b, operation: "request", operationId: op() }, 401);
  await call("a", "friends", { tab: "friends", uid: ids.b }, 400);
  for (const role of ["owner", "co"]) await call(role, "friends", { tab: "friends", uid: ids.a }, 400);
  await call("a", "relationship", { targetUid: ids.b, operation: "request", uid: ids.c }, 400);
  equal((await status("a", "b")).status, "none");
  const requestId = op();
  const first = await act("a", "b", "request", { operationId: requestId }); equal(first.relationship.status, "outgoing");
  equal((await status("b", "a")).status, "incoming");
  equal(await listed("b", "incoming", "a"), true); equal(await listed("a", "outgoing", "b"), true);
  await act("a", "b", "accept", {}, 400);
  await act("c", "b", "accept", {}, 400);
  await act("b", "a", "accept", { expectedRevision: 999999 }, 409);
  const repeats = await Promise.all([act("a", "b", "request", { operationId: requestId }), act("a", "b", "request", { operationId: requestId }), act("b", "a", "request")]);
  equal(repeats.filter(result => result.relationship.status === "friends").length, 0);
  equal((await pairRef.get()).data().status, "pending");
  const requestNotifications = await db.collection(`users/${ids.b}/notifications`).where("type", "==", "social").get();
  equal(requestNotifications.size, 1);
  const notice = requestNotifications.docs[0].data(); equal(notice.ownerId, ids.b); equal(notice.deepLink, "/friends");
  assert.doesNotMatch(`${notice.title} ${notice.body}`, new RegExp(`${ids.a}|Synthetic friend|@example`)); checks++;
  const notificationPath = `users/${ids.b}/notifications/${requestNotifications.docs[0].id}`;
  equal((await direct("b", notificationPath)).status, 200);
  equal((await direct("b", `${notificationPath}?updateMask.fieldPaths=readAt`, "PATCH", { fields: { readAt: { stringValue: new Date(time).toISOString() } } })).status, 200);
  equal((await direct("b", `${notificationPath}?updateMask.fieldPaths=body`, "PATCH", { fields: { body: { stringValue: "Forged social text" } } })).status, 403);
  for (const role of ["a", "owner", "co"]) equal((await direct(role, notificationPath)).status, 403);
  const acceptedId = op(), accepted = await act("b", "a", "accept", { operationId: acceptedId, expectedRevision: first.relationship.revision });
  equal(accepted.relationship.status, "friends");
  equal((await act("b", "a", "accept", { operationId: acceptedId })).relationship.status, "friends");
  equal((await db.collection(`users/${ids.a}/notifications`).where("type", "==", "social").get()).size, 1);
  equal((await pairRef.collection("events").doc("latestrequested").get()).data().type, "requested");
  equal((await pairRef.collection("events").doc("latestaccepted").get()).data().type, "accepted");
  handler = makeHandler(); // A new server instance/device reads the same persisted relationship.
  equal(await listed("a", "friends", "b"), true); equal(await listed("b", "friends", "a"), true);
  equal((await status("a", "b")).status, "friends"); equal((await status("b", "a")).status, "friends");
  await db.runTransaction(tx => assertSocialInteraction({ tx, db, uid: ids.a, targetUid: ids.b, requireFriend: true })); checks++;
  equal((await act("b", "a", "unfriend")).relationship.status, "unfriended");
  equal((await pairRef.collection("events").doc("latestremoved").get()).data().type, "removed");
  equal((await act("a", "b", "request", { operationId: requestId })).relationship.status, "unfriended"); // A stale retry cannot resurrect friendship.
  equal(await listed("a", "friends", "b"), false); equal(await listed("b", "friends", "a"), false);
  await deniedInteraction("a", "b", true);
  await act("a", "c", "request");
  await act("c", "a", "cancel", {}, 400);
  equal((await act("c", "a", "reject")).relationship.status, "rejected");
  await act("a", "c", "request", {}, 409);
  await call("a", "block", { targetUid: ids.c, blocked: true });
  await call("a", "block", { targetUid: ids.c, blocked: false });
  await act("a", "c", "request", {}, 409); // Cannot bypass rejection cooldown by block/unblock.
  time += 25 * 60 * 60_000; // Rejection anti-harassment cooldown, no wall-clock sleeping.
  await act("a", "c", "request");
  const cancelId = op(); equal((await act("a", "c", "cancel", { operationId: cancelId })).relationship.status, "cancelled");
  equal((await act("a", "c", "cancel", { operationId: cancelId })).relationship.status, "cancelled");
  // Concurrent reversed requests share exactly one canonical pair, never auto-accept.
  const beforeRace = await Promise.all([act("a", "c", "request"), act("c", "a", "request")]);
  equal(beforeRace.some(result => result.relationship.status === "friends"), false);
  const racingPair = (await db.doc(`socialRelationships/${canonicalPair(ids.a, ids.c)}`).get()).data();
  equal(racingPair.status, "pending"); equal(new Set(racingPair.memberUids).size, 2);
  const recipient = racingPair.requestedBy === ids.a ? "c" : "a", requester = recipient === "a" ? "c" : "a";
  await act(recipient, requester, "accept");
  // Blocking revokes friendship and future direct/private/friends interactions.
  await call("a", "block", { targetUid: ids.b, blocked: true });
  equal((await status("a", "b")).status, "blocked");
  const hiddenBlock = await status("b", "a"); equal(hiddenBlock.canRequest, false); equal(hiddenBlock.status, "none");
  await act("b", "a", "request", {}, 404);
  await call("b", "view", { identity: ids.a }, 404);
  await deniedInteraction("b", "a", false); await deniedInteraction("b", "a", true);
  await db.doc(`privateConversations/${pair}`).set({ memberUids: [ids.a, ids.b] });
  await db.doc(`socialPosts/friends-only-${suffix}`).set({ ownerUid: ids.a, visibility: "friends", text: "Synthetic private post" });
  equal((await direct("b", `privateConversations/${pair}/messages/forbidden`, "PATCH", { fields: { ownerUid: { stringValue: ids.b }, text: { stringValue: "blocked message" } } })).status, 403);
  equal((await direct("b", `socialPosts/friends-only-${suffix}`)).status, 403);
  equal((await direct("c", `users/${ids.b}/catches/private`)).status, 403);
  const forged = { id: "forged_social", ownerId: ids.b, type: "social", title: "Fake event", body: "Not authorized by server", createdAt: new Date(time).toISOString(), readAt: null, deepLink: "/friends" };
  const fields = Object.fromEntries(Object.entries(forged).map(([key, value]) => [key, value === null ? { nullValue: null } : { stringValue: value }]));
  equal((await direct("b", `users/${ids.b}/notifications/forged_social`, "PATCH", { fields })).status, 403);
  await call("b", "block", { targetUid: ids.a, blocked: true });
  await call("a", "block", { targetUid: ids.b, blocked: false });
  equal((await status("a", "b")).canRequest, false);
  await call("b", "block", { targetUid: ids.a, blocked: false });
  const unblocked = await status("a", "b"); assert.ok(["none", "unfriended"].includes(unblocked.status)); checks++;
  equal((await act("a", "b", "request", { operationId: requestId })).relationship.status === "friends", false);
  equal((await db.collection(`users/${ids.b}/notifications`).where("type", "==", "social").get()).size, 1); // No removal/block notification storm.
  const deletion = createAccountDeletionService({ db, auth, now: () => time, photoDeletion: { enqueue: async () => {} } });
  await deletion.request(ids.a); await deletion.advanceOwner(ids.a, { maxSteps: 30, maxMillis: 20_000 });
  equal((await db.collection("socialRelationships").where("memberUids", "array-contains", ids.a).get()).size, 0);
  equal(await listed("c", "friends", "a"), false);
  equal((await db.doc(`users/${ids.b}/catches/private`).get()).data(), privateCatch);
  equal((await db.doc(`publicProfiles/${ids.b}`).get()).exists, true);
  console.log(`Social friendships: ${checks} real Auth/Firestore transition, privacy, concurrency and deletion checks PASS; 5 authenticated accounts`);
} finally { await deleteApp(app); }
