// Local HTTP and Firebase integration. Cloudinary is always synthetic here.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createCloudinaryApi, createEnabledTestEnvironment, ensureAccountActive, verifyFirebaseIdToken } from "../src/server/cloudinaryApi.js";
import { withNativeApiCors } from "../src/server/nativeApiCors.js";

const projectId = "demo-chytnucz-local";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") {
  throw new Error("Local Auth and Firestore emulators are required.");
}

const app = initializeApp({ projectId }, randomUUID());
const auth = getAuth(app), db = getFirestore(app);
const users = [];
let signatures = 0, checks = 0;
const endpoint = withNativeApiCors(createCloudinaryApi({
  env: createEnabledTestEnvironment(),
  async verifyToken(token) {
    const identity = await verifyFirebaseIdToken(auth, token);
    await ensureAccountActive(db, identity.uid);
    return identity;
  },
  async getPhotoAccess(uid, catchId, photoId) {
    const ref = db.doc(`users/${uid}/catches/${catchId}`);
    const [parent, photo] = await Promise.all([ref.get(), ref.collection("photos").doc(photoId).get()]);
    return { catchRecord: parent.data(), photoRecord: photo.data() };
  },
  getCloudinary: async () => ({ utils: { api_sign_request() { signatures += 1; return "a".repeat(64); } } }),
}).signUpload);

const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (body) req.body = JSON.parse(body);
  res.status = code => { res.statusCode = code; return res; };
  res.json = payload => res.end(JSON.stringify(payload));
  await endpoint(req, res);
});
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "https://localhost";
  const url = `http://127.0.0.1:${server.address().port}/api/cloudinary/sign`;
  for (let i = 0; i < 2; i++) {
    const uid = randomUUID(), email = `${uid}@example.test`, password = "synthetic-local-only-9";
    await auth.createUser({ uid, email, password });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    assert.equal(response.status, 200); checks++;
    users.push({ uid, token: (await response.json()).idToken });
  }
  const [a, b] = users;
  const record = db.doc(`users/${a.uid}/catches/catch-a`);
  await record.set({ id: "catch-a", ownerId: a.uid, photoRefs: { "photo-a": true } });
  await record.collection("photos").doc("photo-a").set({ id: "photo-a", type: "image/jpeg", size: 1024 });
  const payload = { catchId: "catch-a", photoId: "photo-a", size: 1024, contentType: "image/jpeg", sha256: "b".repeat(64) };

  async function preflight(requestOrigin, method = "POST") {
    return fetch(url, { method: "OPTIONS", headers: {
      Origin: requestOrigin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "authorization,content-type",
    } });
  }
  async function post(token, requestOrigin = origin, body = payload) {
    const response = await fetch(url, {
      method: "POST", headers: { Origin: requestOrigin, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, json: await response.json() };
  }
  for (const requestOrigin of [origin, "capacitor://localhost"]) {
    const response = await preflight(requestOrigin);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), requestOrigin);
    assert.equal(response.headers.has("access-control-allow-credentials"), false); checks += 3;
  }
  assert.equal((await preflight("https://outside.invalid")).status, 403); checks++;
  assert.equal((await preflight(origin, "GET")).status, 403); checks++;
  assert.equal(signatures, 0); checks++;
  for (const [token, code] of [[null, "missing_auth"], ["invalid", "invalid_auth"]]) {
    const response = await post(token);
    assert.equal(response.status, 401);
    assert.equal(response.json.error, code);
    assert.equal(response.headers.get("access-control-allow-origin"), origin); checks += 3;
  }
  assert.equal((await post(a.token, "https://outside.invalid")).status, 403); checks++;
  assert.equal((await post(a.token, origin, { ...payload, size: 10_485_761 })).status, 400); checks++;
  const access = await post(a.token);
  assert.equal(access.status, 200);
  assert.equal(access.json.params.type, "authenticated");
  assert.equal(access.json.params.overwrite, false); checks += 3;
  assert.equal((await post(b.token)).status, 403); checks++;
  await db.doc(`accountSuspensions/${a.uid}`).set({ fixture: true });
  assert.equal((await post(a.token)).status, 403); checks++;
  await db.doc(`accountSuspensions/${a.uid}`).delete();
  await db.doc(`accountDeletions/${a.uid}`).set({ fixture: true });
  assert.equal((await post(a.token)).status, 403); checks++;
  assert.equal(signatures, 1); checks++;
  console.log(`Native photo API emulator: ${checks} HTTP/Firebase checks PASS.`);
} finally {
  await new Promise(resolve => server.close(resolve));
  for (const { uid } of users) {
    await db.doc(`accountDeletions/${uid}`).delete();
    await db.doc(`accountSuspensions/${uid}`).delete();
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await auth.deleteUser(uid);
  }
  await app.delete();
}
