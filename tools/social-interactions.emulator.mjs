// Synthetic local fixtures only. Requires the Auth and Firestore emulators.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createPublicProfileService } from "../src/features/social/server/publicProfileService.js";
import { createSocialHandler } from "../src/features/social/server/socialApi.js";
import { createAdminService } from "../src/features/admin/server/adminStore.js";
import { canonicalPair } from "../src/features/social/data/socialModel.js";
import { publicationId } from "../src/features/social/data/publicationModel.js";
import { changeInteractionCounts } from "../src/features/social/server/socialInteractionCounters.js";
import { createAccountDeletionService } from "../src/server/accountDeletion.js";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") {
  throw new Error("Local Auth/Firestore emulators required");
}

const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const app = initializeApp({ projectId: "demo-chytnucz-local" }, `interactions-${suffix}`);
const db = getFirestore(app), auth = getAuth(app);
const roles = ["a", "b", "c", "moderator", "owner", "co"];
const ids = Object.fromEntries(roles.map(role => [role, `interaction-${role}-${suffix}`]));
const tokens = {};
const originalConfig = await db.doc("adminConfig/social").get();
let time = Date.now(), requests = 0, checks = 0;
const env = { CHYTNU_OWNER_UID: ids.owner, CHYTNU_CO_CREATOR_UID: ids.co };
const socialPhoto = {
  prepare: async (_identity, photo) => ({ version: "fixture", sha256: photo.cloud.sha256, transformationVersion: 1, width: 80, height: 80 }),
  delivery: async () => new Uint8Array([255, 216, 255, 217]),
};
const handler = createSocialHandler({ service: createPublicProfileService({
  db, auth, avatar: {}, socialPhoto, env, now: () => time, cursorSecret: `interaction-test-${suffix}-cursor-secret-long`,
}) });
const admin = createAdminService({ db, auth, ownerUid: ids.owner, env, now: () => time });
const postId = (role, catchId) => publicationId(ids[role], catchId);
const postRef = (role, catchId) => db.doc(`socialPosts/${postId(role, catchId)}`);
const commentPath = (catchId, id) => `socialPosts/${postId("a", catchId)}/comments/${id}`;
const relationRef = () => db.doc(`socialRelationships/${canonicalPair(ids.a, ids.b)}`);
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const safe = value => {
  assert.doesNotMatch(JSON.stringify(value), /SECRET|latitude|longitude|sourceCatchId|sourcePhotoId|objectKey|sha256|mediaReceipt|sourceFingerprint|photoRefs|ownerId/);
  checks++;
};
async function call(role, action, payload = {}, expected = 200) {
  if (++requests % 18 === 0) time += 60_000;
  const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "POST", headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}, body: { action, ...payload } }, response);
  assert.equal(response.statusCode, expected, `${role}/${action}: ${JSON.stringify(response.body)}`);
  checks++;
  return response.body;
}
async function direct(role, path) {
  return fetch(`http://127.0.0.1:8080/v1/projects/demo-chytnucz-local/databases/(default)/documents/${path}`, {
    headers: tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {},
  });
}
async function moderatorCall(role, action, payload = {}) {
  return admin.execute({ action, ...payload }, { uid: ids[role], auth_time: Math.floor(time / 1000) });
}
async function makePost(role, catchId, visibility, photoId = null) {
  const current = await call(role, "posts.own", { catchId });
  return (await call(role, "posts.save", {
    catchId, photoId, visibility, description: `Fixture ${role}/${catchId}`, fields: {},
    expectedRevision: current.post?.revision ?? 0,
  })).post;
}

try {
  await db.doc("adminConfig/social").set({ enabled: true }, { merge: true });
  for (const role of roles) {
    await auth.createUser({ uid: ids[role], email: `${ids[role]}@example.test`, password: `Synthetic-${suffix}-9!` });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${ids[role]}@example.test`, password: `Synthetic-${suffix}-9!`, returnSecureToken: true }),
    });
    equal(response.status, 200);
    tokens[role] = (await response.json()).idToken;
  }
  await db.doc(`adminAccounts/${ids.moderator}`).set({ role: "ADMIN", permissions: ["moderation"], revision: 1 });
  await db.doc(`adminAccounts/${ids.co}`).set({ role: "CO_CREATOR", permissions: [], revision: 1 });

  for (const role of ["a", "b", "c"]) {
    await call(role, "save", { profile: {
      handle: `int_${role}_${suffix}`, displayName: `Synthetic ${role}`, visibility: "public", discoverable: true,
      sections: { catches: "public", gallery: "public" },
    } });
  }
  const catchFixture = (role, id) => ({
    id, ownerId: ids[role], species: "Kapr", weightKg: 4, lengthCm: 52, caughtAt: new Date(time).toISOString(),
    deleted: false, privacy: { visibility: "private", photoVisibility: "private", locationPrecision: "none", privateSpot: true, nearbyEligible: false, heatmapEligible: false },
    coordinates: { latitude: 50.123456, longitude: 14.654321 }, notes: "SECRET-DIARY-NOTE", photoRefs: {},
  });
  for (const [role, catchIds] of [["a", ["public", "friends", "private", "with-photo"]], ["b", ["public"]], ["c", ["public"]]]) {
    for (const id of catchIds) await db.doc(`users/${ids[role]}/catches/${id}`).set(catchFixture(role, id));
  }
  const photoId = "private-photo";
  await db.doc(`users/${ids.a}/catches/with-photo`).update({ photoRefs: { [photoId]: true } });
  await db.doc(`users/${ids.a}/catches/with-photo/photos/${photoId}`).set({
    id: photoId, name: "private.jpg", type: "image/jpeg", size: 4000, deleted: false, deletedAt: null,
    focalX: 0.5, focalY: 0.5, zoom: 1, sortIndex: 0,
    cloud: { provider: "cloudinary", objectKey: `users/${ids.a}/catches/with-photo/photos/${photoId}/original`, state: "synced", sha256: "a".repeat(64) },
  });
  const publicPost = await makePost("a", "public", "public");
  const friendPost = await makePost("a", "friends", "friends");
  const privatePost = await makePost("a", "private", "private");
  const photoPost = await makePost("a", "with-photo", "friends", photoId);
  const bPost = await makePost("b", "public", "public");
  const cPost = await makePost("c", "public", "public");
  const retainedByA = randomUUID();
  await call("a", "comments.save", {
    postId: bPost.id, commentId: retainedByA, text: "Komentář A zůstává po smazání autora příspěvku", expectedRevision: 0,
  });
  safe(await call("b", "feed.list", { mode: "global" }));
  equal((await call("b", "feed.list", { mode: "global" })).posts.some(post => post.id === publicPost.id), true);
  equal((await call("c", "feed.list", { mode: "global" })).posts.some(post => post.id === friendPost.id), false);
  await call("b", "interactions.list", { postId: friendPost.id }, 404);
  await call("c", "interactions.list", { postId: privatePost.id }, 404);
  await call("owner", "interactions.list", { postId: privatePost.id }, 404);
  await call("c", "posts.image", { postId: photoPost.id }, 404);
  await call("b", "posts.image", { postId: photoPost.id }, 404);
  const storedSource = (await db.doc(`users/${ids.a}/catches/with-photo`).get()).data();
  equal(storedSource.notes, "SECRET-DIARY-NOTE");
  equal(storedSource.coordinates.latitude, 50.123456);

  await call("b", "relationship", { targetUid: ids.a, operation: "request", operationId: randomUUID() });
  await call("a", "relationship", { targetUid: ids.b, operation: "accept", operationId: randomUUID() });
  equal((await call("b", "feed.list", { mode: "friends" })).posts.some(post => post.id === friendPost.id), true);
  await call("b", "posts.image", { postId: photoPost.id });
  safe(await call("b", "posts.view", { postId: photoPost.id }));
  await call("b", "relationship", { targetUid: ids.a, operation: "unfriend", operationId: randomUUID() });
  await call("b", "interactions.list", { postId: friendPost.id }, 404);
  await call("b", "relationship", { targetUid: ids.a, operation: "request", operationId: randomUUID() });
  await call("a", "relationship", { targetUid: ids.b, operation: "accept", operationId: randomUUID() });
  await call("b", "block", { targetUid: ids.a, blocked: true });
  await call("b", "interactions.list", { postId: publicPost.id }, 404);
  await call("b", "block", { targetUid: ids.a, blocked: false });

  const op = () => randomUUID();
  const firstReaction = { postId: publicPost.id, kind: "respect", operationId: op() };
  const reactionRace = await Promise.all([
    call("b", "reactions.set", firstReaction),
    call("b", "reactions.set", firstReaction),
  ]);
  equal(reactionRace[0].counts.respect + reactionRace[1].counts.respect, 2);
  equal((await call("b", "interactions.list", { postId: publicPost.id })).counts.respect, 1);
  await call("b", "reactions.set", { postId: publicPost.id, kind: "trophy", operationId: op() });
  let summary = await call("a", "interactions.list", { postId: publicPost.id });
  equal(summary.counts.respect, 0); equal(summary.counts.trophy, 1); equal(summary.myReaction, null);
  await call("b", "reactions.set", { postId: publicPost.id, kind: null, operationId: op() });
  summary = await call("a", "interactions.list", { postId: publicPost.id });
  equal(summary.counts.trophy, 0);
  const concurrent = await Promise.all([
    call("b", "reactions.set", { postId: publicPost.id, kind: "respect", operationId: op() }),
    call("c", "reactions.set", { postId: publicPost.id, kind: "atmosphere", operationId: op() }),
  ]);
  equal(concurrent.length, 2);
  summary = await call("a", "interactions.list", { postId: publicPost.id });
  equal(summary.counts.respect, 1); equal(summary.counts.atmosphere, 1);

  const xssComment = randomUUID();
  const xssText = '<script>alert("x")</script>';
  const savedComment = await call("b", "comments.save", { postId: publicPost.id, commentId: xssComment, text: xssText, expectedRevision: 0 });
  equal(savedComment.comment.text, xssText);
  await call("b", "comments.save", { postId: publicPost.id, commentId: randomUUID(), text: "x".repeat(501), expectedRevision: 0 }, 400);
  await call("b", "comments.save", { postId: publicPost.id, commentId: randomUUID(), text: "   ", expectedRevision: 0 }, 400);
  await call("b", "comments.save", { postId: publicPost.id, commentId: randomUUID(), text: xssText, expectedRevision: 0 }, 429);
  const maxComment = randomUUID();
  await call("b", "comments.save", { postId: publicPost.id, commentId: maxComment, text: "m".repeat(500), expectedRevision: 0 });
  await call("b", "comments.delete", { postId: publicPost.id, commentId: maxComment, expectedRevision: 1 });
  const ownComment = randomUUID(), retainedComment = randomUUID();
  await call("b", "comments.save", { postId: publicPost.id, commentId: ownComment, text: "Můj komentář", expectedRevision: 0 });
  await call("b", "comments.delete", { postId: publicPost.id, commentId: ownComment, expectedRevision: 1 });
  await call("b", "comments.save", { postId: publicPost.id, commentId: retainedComment, text: "Zůstane do smazání účtu", expectedRevision: 0 });
  await call("c", "comments.delete", { postId: publicPost.id, commentId: xssComment, expectedRevision: 1 }, 404);
  const cComment = randomUUID();
  await call("c", "comments.save", { postId: publicPost.id, commentId: cComment, text: "Komentář od C", expectedRevision: 0 });
  await call("c", "comments.delete", { postId: publicPost.id, commentId: cComment, expectedRevision: 1 });
  const viewedByA = await call("a", "interactions.list", { postId: publicPost.id });
  equal(viewedByA.comments.some(comment => comment.id === xssComment), true);
  equal(viewedByA.comments.some(comment => comment.id === ownComment), false);
  equal((await direct("c", `socialPosts/${publicPost.id}/comments/${xssComment}`)).status, 403);
  equal((await direct("c", `users/${ids.a}/catches/public`)).status, 403);
  equal((await direct("c", `socialReports/${"a".repeat(64)}`)).status, 403);
  const reports = await db.collection("socialReports");
  const postReport = { postId: publicPost.id, reason: "spam", details: "Opakovaný spam" };
  const commentReport = { postId: publicPost.id, commentId: xssComment, reason: "inappropriate", details: "Testovací HTML" };
  await call("c", "reports.create", postReport);
  await call("c", "reports.create", postReport);
  await call("c", "reports.create", commentReport);
  await call("b", "reports.create", { postId: publicPost.id, reason: "other", details: "Hlášení od B" });
  equal((await reports.where("reporterUid", "==", ids.c).get()).size, 2);
  await call("anonymous", "reports.create", postReport, 401);
  await call("c", "interactions.list", { postId: privatePost.id }, 404);

  await assert.rejects(() => moderatorCall("c", "social.reports.list"), /forbidden/); checks++;
  await assert.rejects(() => moderatorCall("co", "social.reports.list"), /forbidden/); checks++;
  const modList = await moderatorCall("moderator", "social.reports.list");
  equal(modList.reports.length, 3);
  assert.ok(modList.reports.every(report => typeof report.reporterUid === "string")); checks++;
  const commentReportDoc = (await reports.where("commentId", "==", xssComment).get()).docs[0];
  await assert.rejects(() => moderatorCall("c", "social.report.resolve", {
    reportId: commentReportDoc.id, status: "resolved", reason: "Moderace", hide: true,
  }), /forbidden/); checks++;
  await moderatorCall("moderator", "social.report.resolve", {
    reportId: commentReportDoc.id, status: "resolved", reason: "Testovací moderace", hide: true,
  });
  equal((await call("a", "interactions.list", { postId: publicPost.id })).comments.some(comment => comment.id === xssComment), false);
  const visibleCount = (await call("a", "interactions.list", { postId: publicPost.id })).commentCount;
  equal(visibleCount, 1);
  const postReportDoc = (await reports.where("reporterUid", "==", ids.c).get()).docs.find(doc => doc.data().postId === publicPost.id);
  assert.ok(postReportDoc); checks++;
  await moderatorCall("owner", "social.report.resolve", {
    reportId: postReportDoc.id, status: "dismissed", reason: "Příspěvek je v pořádku", hide: false,
  });
  await assert.rejects(() => moderatorCall("co", "social.report.resolve", {
    reportId: postReportDoc.id, status: "resolved", reason: "Bez oprávnění", hide: true,
  }), /forbidden/); checks++;
  const postReportStored = (await db.doc(`socialReports/${postReportDoc.id}`).get()).data();
  equal(postReportStored.status, "dismissed");
  equal(postReportStored.reporterUid, ids.c);

  await call("a", "posts.delete", { postId: cPost.id, expectedRevision: cPost.revision }, 404);
  await call("c", "posts.delete", { postId: cPost.id, expectedRevision: cPost.revision });
  await call("a", "interactions.list", { postId: cPost.id }, 404);

  const bHash = createHash("sha256").update(ids.b).digest("hex");
  const deletion = createAccountDeletionService({ db, auth, now: () => time, photoDeletion: { enqueue: async () => {} }, pageSize: 10 });
  await deletion.request(ids.b);
  const deleted = await deletion.advanceOwner(ids.b, { maxSteps: 40, maxMillis: 20_000 });
  equal(deleted.status, "completed");
  equal((await db.doc(`publicProfiles/${ids.b}`).get()).exists, false);
  equal((await db.doc(commentPath("public", retainedComment)).get()).exists, false);
  equal((await db.doc(`socialPosts/${bPost.id}`).get()).exists, false);
  equal((await db.doc(`socialPosts/${bPost.id}/comments/${retainedByA}`).get()).exists, false);
  await call("a", "interactions.list", { postId: bPost.id }, 404);
  equal((await direct("c", `socialPosts/${bPost.id}/comments/${retainedByA}`)).status, 403);
  equal((await db.doc(`socialPosts/${publicPost.id}`).get()).exists, true);
  equal((await db.doc(`users/${ids.a}/catches/public`).get()).exists, true);
  equal((await db.doc(`serverRateLimits/social-reaction-minute-${bHash}`).get()).exists, false);
  equal((await db.doc(`serverRateLimits/social-comment-minute-${bHash}`).get()).exists, false);
  equal((await db.doc(`serverRateLimits/social-report-${bHash}`).get()).exists, false);
  equal((await reports.where("reporterUid", "==", ids.b).get()).size, 0);
  equal((await reports.where("targetUid", "==", ids.b).get()).size, 0);
  equal((await call("a", "interactions.list", { postId: publicPost.id })).counts.respect, 0);
  equal((await call("a", "interactions.list", { postId: publicPost.id })).commentCount, 0);
  await call("a", "interactions.list", { postId: privatePost.id });
  await call("a", "interactions.list", { postId: friendPost.id });

  await assert.rejects(() => moderatorCall("moderator", "social.report.resolve", {
    reportId: "f".repeat(64), status: "resolved", reason: "Neexistující hlášení", hide: true,
  }), /report_unavailable/); checks++;
  console.log(`Social interactions: ${checks} Auth/Firestore interaction, moderation, privacy and deletion checks PASS; ${roles.length} accounts.`);
} finally {
  for (const uid of Object.values(ids)) {
    const owned = await db.collection("socialPosts").where("ownerUid", "==", uid).limit(100).get();
    await Promise.all(owned.docs.map(row => db.recursiveDelete(row.ref)));
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.recursiveDelete(db.doc(`socialBlocks/${uid}`));
    await db.recursiveDelete(db.doc(`adminAccounts/${uid}`));
    await db.recursiveDelete(db.doc(`publicProfiles/${uid}`));
    await db.recursiveDelete(db.doc(`accountDeletions/${uid}`));
    await auth.deleteUser(uid).catch(error => { if (error.code !== "auth/user-not-found") throw error; });
  }
  await relationRef().delete();
  for (const report of (await db.collection("socialReports").where("targetUid", "in", Object.values(ids)).get()).docs) await report.ref.delete();
  if (originalConfig.exists) await db.doc("adminConfig/social").set(originalConfig.data());
  else await db.doc("adminConfig/social").delete();
  await deleteApp(app);
}
