// Synthetic accounts only. Requires the local Auth and Firestore emulators.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createPublicProfileService } from "../src/features/social/server/publicProfileService.js";
import { createSocialHandler } from "../src/features/social/server/socialApi.js";
import { createAdminService } from "../src/features/admin/server/adminStore.js";
import { deleteSocialPage } from "../src/features/social/server/socialDeletion.js";
import { contentFingerprint, publicationContent, publicationId } from "../src/features/social/data/publicationModel.js";
import catalogue from "../public/data/ris/be90ad549cf77679/index.json" with { type: "json" };

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local Auth/Firestore emulators required");
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `nearby-${randomUUID()}`), db = getFirestore(app), auth = getAuth(app);
const suffix = randomUUID().replaceAll("-", "").slice(0, 8), ids = [], tokens = [];
let time = Date.now(), checks = 0;
const handler = createSocialHandler({ features: { nearby: true, waterPresence: true, waterChat: true }, service: createPublicProfileService({ db, auth, env: {}, now: () => time,
  cursorSecret: "synthetic-nearby-emulator-cursor-key-over-32-characters" }) });
async function call(index, action, payload = {}, expected = 200) {
  const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "POST", headers: tokens[index] ? { authorization: `Bearer ${tokens[index]}` } : {}, body: { action, ...payload } }, response);
  assert.equal(response.statusCode, expected, `${index}/${action}: ${JSON.stringify(response.body)}`); checks++;
  return response.body;
}
try {
  for (let i = 0; i < 6; i++) {
    const uid = `nearby-${i}-${suffix}`; ids.push(uid);
    await auth.createUser({ uid, email: `${uid}@example.test`, password: `Nearby-${suffix}-9!` });
    const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@example.test`, password: `Nearby-${suffix}-9!`, returnSecureToken: true }) });
    assert.equal(login.status, 200); tokens.push((await login.json()).idToken); checks++;
  }
  await call(-1, "nearby.join", { latitude: 50.087, longitude: 14.421 }, 401);
  await call(-1, "nearby.consent", { accepted: true }, 401);
  await call(-1, "nearby.discover", {}, 401);
  await call(-1, "nearby.waterActivity", { catalogueId: catalogue[0].id }, 401);
  await call(0, "nearby.consent", { accepted: "yes" }, 400);
  await call(0, "nearby.join", { latitude: 50.087, longitude: 14.421 }, 403);
  await call(0, "nearby.consent", { accepted: true });
  await call(0, "nearby.join", { latitude: 91, longitude: 14.421 }, 400);
  await call(0, "nearby.join", { latitude: 50.087, longitude: -181 }, 400);
  time += 60_000;
  await call(0, "nearby.join", { latitude: 50.087, longitude: 14.421 });
  const ownConsent = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/users/${ids[0]}/socialPreferences/nearby`, { headers: { Authorization: `Bearer ${tokens[0]}` } });
  assert.equal(ownConsent.status, 403); checks++;
  const forgedConsent = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/users/${ids[0]}/socialPreferences?documentId=nearby`, { method: "POST", headers: { Authorization: `Bearer ${tokens[0]}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { version: { integerValue: "1" }, accepted: { booleanValue: true }, updatedAt: { integerValue: `${time}` } } }) });
  assert.equal(forgedConsent.status, 403); checks++;
  for (let i = 1; i < 4; i++) { await call(i, "nearby.consent", { accepted: true }); assert.equal((await call(i, "nearby.join", { latitude: 50.087, longitude: 14.421 })).nearbyCount, null); }
  await call(4, "nearby.consent", { accepted: true });
  const fifth = await call(4, "nearby.join", { latitude: 50.087, longitude: 14.421 });
  assert.equal(fifth.nearbyCount, "5+"); assert.equal("latitude" in fifth, false); assert.equal("longitude" in fifth, false); checks += 3;
  assert.deepEqual(await call(4, "nearby.status"), { accepted: true, showProfile: false, expiresAt: fifth.expiresAt }); checks++;
  const profile = (index, visibility = "public") => ({ uid: ids[index], handle: `fisher_${index}`,
    displayName: `Rybář ${index}`, visibility, discoverable: true, sections: { catches: "public" }, bio: "PRIVATE_SENTINEL" });
  await Promise.all([1, 2, 3].map(index => db.doc(`publicProfiles/${ids[index]}`).set(profile(index, index === 2 ? "private" : "public"))));
  await call(1, "nearby.consent", { accepted: true, showProfile: true });
  await call(2, "nearby.consent", { accepted: true, showProfile: true });
  await call(5, "nearby.consent", { accepted: true });
  assert.deepEqual(await call(5, "nearby.discover"), { active: false, profiles: [] }); checks++;
  assert.deepEqual((await call(0, "nearby.discover")).profiles, [{ handle: "fisher_1", displayName: "Rybář 1" }]); checks++;
  const block = db.doc(`socialBlocks/${ids[1]}/blocked/${ids[0]}`);
  await block.set({ createdAt: time });
  assert.deepEqual((await call(0, "nearby.discover")).profiles, []); checks++;
  await block.delete();
  await call(1, "nearby.consent", { accepted: true, showProfile: false });
  assert.deepEqual((await call(0, "nearby.discover")).profiles, []); checks++;

  const water = catalogue[0], sourceCatchId = "nearby-catch";
  const parent = { ownerId: ids[1], species: "Kapr", caughtAt: new Date(time).toISOString(), waterId: "nearby-water",
    gps: { latitude: 50.087, longitude: 14.421 }, notes: "PRIVATE_SENTINEL" };
  const input = { fields: { water: true, date: "day" }, description: "Veřejný popis" };
  const content = publicationContent(parent, input, water);
  const postId = publicationId(ids[1], sourceCatchId);
  const post = db.doc(`socialPosts/${postId}`);
  await db.doc(`users/${ids[1]}/waters/nearby-water`).set({ ownerId: ids[1], catalogueId: water.id });
  await db.doc(`users/${ids[1]}/catches/${sourceCatchId}`).set(parent);
  await post.set({ id: postId, kind: "catch", ownerUid: ids[1], sourceCatchId, createdAt: time, moderationState: "visible",
    ...input, visibility: "public", content, sourceFingerprint: contentFingerprint({ content, privacy: "private", photoSha: null }) });
  assert.deepEqual((await call(0, "nearby.waterActivity", { catalogueId: water.id })).posts,
    [{ id: postId, species: "Kapr", month: parent.caughtAt.slice(0, 7), displayName: "Rybář 1" }]); checks++;
  await call(0, "nearby.waterActivity", { catalogueId: "private-water" }, 400);
  await post.update({ visibility: "friends" });
  assert.deepEqual((await call(0, "nearby.waterActivity", { catalogueId: water.id })).posts, []); checks++;
  const docId = createHash("sha256").update(ids[0]).digest("hex"), stored = (await db.doc(`nearbyPresence/${docId}`).get()).data();
  assert.equal(stored.ownerUid, ids[0]); assert.equal("latitude" in stored, false); assert.equal("longitude" in stored, false); checks += 3;
  const direct = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/nearbyPresence/${docId}`, { headers: { Authorization: `Bearer ${tokens[0]}` } });
  assert.equal(direct.status, 403); checks++;
  const forgedPresence = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/nearbyPresence?documentId=forged`, { method: "POST", headers: { Authorization: `Bearer ${tokens[0]}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { ownerUid: { stringValue: ids[0] }, coarseCell: { stringValue: "u2fk" }, expiresAt: { integerValue: `${time + 60_000}` }, createdAt: { integerValue: `${time}` } } }) });
  assert.equal(forgedPresence.status, 403); checks++;
  await call(4, "nearby.consent", { accepted: false });
  assert.equal((await db.doc(`nearbyPresence/${createHash("sha256").update(ids[4]).digest("hex")}`).get()).exists, false); checks++;
  await call(4, "nearby.join", { latitude: 50.087, longitude: 14.421 }, 403);
  await call(4, "nearby.leave");
  await call(3, "nearby.consent", { accepted: true }); await call(3, "nearby.join", { latitude: 50.087, longitude: 14.421 });
  await call(3, "nearby.leave");
  await call(5, "nearby.consent", { accepted: true });
  assert.equal((await call(5, "nearby.join", { latitude: 50.087, longitude: 14.421 })).nearbyCount, null);
  await call(5, "nearby.leave");
  for (let i = 0; i < 5; i++) { await call(i, "nearby.consent", { accepted: true }); await call(i, "nearby.join", { latitude: 50.087, longitude: 14.421 }); }
  time += 21 * 60_000;
  assert.deepEqual(await call(0, "nearby.discover"), { active: false, profiles: [] }); checks++;
  assert.equal((await call(5, "nearby.join", { latitude: 50.087, longitude: 14.421 })).nearbyCount, null);
  for (let i = 0; i < 3; i++) await call(5, "nearby.join", { latitude: 50.087, longitude: 14.421 });
  await call(5, "nearby.join", { latitude: 50.087, longitude: 14.421 }, 429);
  await call(5, "nearby.consent", { accepted: false });
  assert.deepEqual(await call(5, "nearby.discover"), { active: false, profiles: [] }); checks++;
  assert.deepEqual(await call(5, "nearby.status"), { accepted: false, showProfile: false, expiresAt: null }); checks++;
  const disabled = createSocialHandler({ service: { execute() { throw new Error("Disabled feature reached service"); } } });
  const unavailable = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await disabled({ method: "POST", headers: { authorization: `Bearer ${tokens[0]}` }, body: { action: "nearby.discover" } }, unavailable);
  assert.equal(unavailable.statusCode, 404); checks++;
  console.log(`Nearby emulator: ${checks} checks PASS`);
  const previousChecks = checks;
  const waterId = catalogue[0].id;
  await call(-1, "waterPresence.status", {}, 401);
  await call(0, "waterPresence.join", { waterId, confirmed: true, longitude: 14 }, 400);
  await call(0, "waterPresence.join", { waterId, confirmed: false }, 400);
  const session = await call(0, "waterPresence.join", { waterId, confirmed: true });
  assert.deepEqual(await call(0, "waterPresence.status"), session); checks++;
  assert.deepEqual(await call(1, "waterPresence.status"), { active: false }); checks++;
  await call(1, "waterPresence.leave", { sessionId: session.sessionId });
  assert.deepEqual(await call(0, "waterPresence.status"), session); checks++;
  const directWater = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/waterPresence/${docId}`, { headers: { Authorization: `Bearer ${tokens[0]}` } });
  assert.equal(directWater.status, 403); checks++;
  const { sessionId } = await call(0, "waterPresence.refresh", { sessionId: session.sessionId });
  await call(0, "waterPresence.leave", { sessionId: session.sessionId }, 409);
  assert.notEqual(session.sessionId, sessionId); checks++;
  await call(0, "waterPresence.leave", { sessionId });
  assert.deepEqual(await call(0, "waterPresence.status"), { active: false }); checks++;
  const expired = await call(0, "waterPresence.join", { waterId, confirmed: true });
  time += 30 * 60_000;
  assert.deepEqual(await call(0, "waterPresence.status"), { active: false }); checks++;
  await call(0, "waterPresence.refresh", { sessionId: expired.sessionId }, 409);
  console.log(`Water presence emulator: ${checks - previousChecks} checks PASS`);
  const beforeChat = checks;
  const config = db.doc("adminConfig/social");
  const savedConfig = await config.get();
  try {
    await config.set({ waterChatEnabled: false }, { merge: true });
    await db.doc(`publicProfiles/${ids[0]}`).set(profile(0));
    const author = await call(0, "waterPresence.join", { waterId, confirmed: true });
    const reader = await call(1, "waterPresence.join", { waterId, confirmed: true });
    const room = { waterId, sessionId: reader.sessionId };
    const draft = { waterId, sessionId: author.sessionId, text: "Syntetická zpráva", operationId: randomUUID() };
    await call(-1, "waterChat.list", room, 401);
    await call(0, "waterChat.send", draft, 503);
    await config.set({ waterChatEnabled: true }, { merge: true });
    await call(2, "waterChat.list", room, 403);
    await call(1, "waterChat.list", { ...room, sessionId: author.sessionId }, 409);
    const sent = await call(0, "waterChat.send", draft);
    assert.deepEqual(await call(0, "waterChat.send", draft), sent); checks++;
    await call(0, "waterChat.send", { ...draft, text: "Odlišná zpráva" }, 409);
    assert.deepEqual((await call(1, "waterChat.list", room)).messages, [sent.message]); checks++;
    assert.deepEqual(Object.keys(sent.message).sort(), ["author", "createdAt", "id", "text"]); checks++;
    assert.deepEqual(Object.keys(sent.message.author).sort(), ["displayName", "handle"]); checks++;
    const messageRef = db.doc(`waterRooms/${waterId}/messages/${sent.message.id}`);
    const directMessage = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/${messageRef.path}`, { headers: { Authorization: `Bearer ${tokens[1]}` } });
    assert.equal(directMessage.status, 403); checks++;
    await block.set({ createdAt: time });
    assert.deepEqual((await call(1, "waterChat.list", room)).messages, []); checks++;
    await block.delete();
    for (let i = 0; i < 15; i++) {
      if (i % 4 === 0) time += 60_000;
      await call(0, "waterChat.send", { ...draft, operationId: randomUUID() });
    }
    const page = await call(1, "waterChat.list", room);
    assert.equal(page.messages.length, 15); assert.ok(page.nextCursor); checks += 2;
    const next = await call(1, "waterChat.list", { ...room, cursor: page.nextCursor });
    assert.deepEqual(next.messages, [sent.message]); assert.equal(next.nextCursor, null); checks += 2;
    await call(0, "waterChat.list", { waterId, sessionId: author.sessionId, cursor: page.nextCursor }, 400);
    await messageRef.update({ createdAt: time - 8 * 86_400_000 });
    assert.equal((await call(1, "waterChat.list", room)).nextCursor, null); checks++;
    const report = { ...room, messageId: page.messages[0].id, reason: "spam" };
    await call(2, "waterChat.report", report, 403);
    await call(1, "waterChat.report", { ...report, reason: "invalid" }, 400);
    await call(1, "waterChat.report", report);
    await call(1, "waterChat.report", report);
    const reports = await db.collection("socialReports").where("reporterUid", "==", ids[1]).get();
    assert.equal(reports.size, 1); checks++;
    const reportDoc = reports.docs[0];
    const directReport = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/${reportDoc.ref.path}`, { headers: { Authorization: `Bearer ${tokens[1]}` } });
    assert.equal(directReport.status, 403); checks++;
    const admin = createAdminService({ db, auth, ownerUid: ids[3], env: {}, now: () => time });
    const resolution = { action: "social.report.resolve", reportId: reportDoc.id, hide: true, status: "resolved", reason: "Místní kontrola" };
    await assert.rejects(admin.execute(resolution, await auth.verifyIdToken(tokens[2])), /forbidden/); checks++;
    await admin.execute(resolution, await auth.verifyIdToken(tokens[3]));
    assert.equal((await call(1, "waterChat.list", room)).messages.some(message => message.id === report.messageId), false); checks++;
    await db.doc(`accountDeletions/${ids[0]}`).set({});
    assert.deepEqual((await call(1, "waterChat.list", room)).messages, []); checks++;
    assert.equal(await deleteSocialPage(db, ids[0]), true); checks++;
    assert.equal((await messageRef.get()).exists, false); checks++;
    assert.equal((await db.collection(`users/${ids[0]}/socialReferences`).get()).size, 0); checks++;
    await db.doc(`accountDeletions/${ids[0]}`).delete();
    time += 30 * 60_000;
    await call(1, "waterChat.list", room, 403);
  } finally {
    if (savedConfig.exists) await config.set(savedConfig.data());
    else await config.delete();
  }
  console.log(`Water room emulator: ${checks - beforeChat} checks PASS`);
} finally {
  for (const uid of ids) { await db.doc(`accountDeletions/${uid}`).delete(); await db.doc(`accountSuspensions/${uid}`).delete(); await auth.deleteUser(uid).catch(() => {}); }
  await app.delete();
}
