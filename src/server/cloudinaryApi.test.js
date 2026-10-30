import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import test from "node:test";
import { classifyFirebaseAuthFailure, cloudinaryPublicId, createCloudinaryApi, createEnabledTestEnvironment, initializeFirebaseAdminContext, MAX_PHOTO_BYTES, readFirebaseServiceAccount, verifyFirebaseIdToken } from "./cloudinaryApi.js";

const ownerId = "owner-a";
const otherOwnerId = "owner-b";
const catchId = "catch-a";
const photoId = "photo-a";
const objectKey = `users/${ownerId}/catches/${catchId}/photos/${photoId}/original`;
const sha256 = "a".repeat(64);

function makePhotoAccess(uid = ownerId, { deleted = false, catchDeleted = false } = {}) {
  return {
    catchRecord: { id: catchId, ownerId: uid, deleted: catchDeleted, photoRefs: deleted ? {} : { [photoId]: true } },
    photoRecord: { id: photoId, deleted, type: "image/jpeg", size: 1024,
      cloud: { state: "synced", provider: "cloudinary", objectKey, sha256 } },
  };
}

function createHarness({ access = makePhotoAccess(), resource = null, deleteResult = { result: "ok" }, rateAllowed = true, fetchImpl } = {}) {
  const signed = [];
  const reads = [];
  const deletes = [];
  const scheduledDeletes = [];
  const deliveries = [];
  const api = createCloudinaryApi({
    env: createEnabledTestEnvironment(),
    verifyToken: async (token) => {
      if (token === "owner-a-token") return { uid: ownerId };
      if (token === "owner-b-token") return { uid: otherOwnerId };
      throw Object.assign(new Error("private verifier details"), { code: "auth/invalid-id-token" });
    },
    getPhotoAccess: async (uid, receivedCatchId, receivedPhotoId) => {
      reads.push({ uid, catchId: receivedCatchId, photoId: receivedPhotoId });
      return typeof access === "function" ? access(uid, receivedCatchId, receivedPhotoId) : access;
    },
    consumeRateLimit: async () => rateAllowed,
    schedulePhotoDeletion: async (identity) => {
      scheduledDeletes.push(identity);
      return { jobId: "stable-delete-job", deleteAfter: "2026-10-22T12:00:00.000Z" };
    },
    fetchImpl,
    getCloudinary: async () => ({
      utils: {
        api_sign_request(params, secret) { signed.push({ params, secret }); return "b".repeat(64); },
        private_download_url(publicId, format, options) { deliveries.push({ publicId, format, options }); return "https://api.cloudinary.com/short-lived-private-url"; },
      },
      api: { async resource(...args) { reads.push({ resource: args }); return resource ?? { public_id: cloudinaryPublicId(ownerId, catchId, photoId), resource_type: "image", type: "authenticated", bytes: 1024, format: "jpg", width: 1200, height: 900 }; } },
      uploader: { async destroy(...args) { deletes.push(args); return deleteResult; } },
    }),
    now: () => Date.parse("2026-10-21T12:00:00.000Z"),
  });
  return { api, signed, reads, deletes, deliveries, scheduledDeletes };
}

function request(handler, { method = "POST", authorization = "Bearer owner-a-token", body = { catchId, photoId } } = {}) {
  const response = { headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
  };
  return Promise.resolve(handler({ method, headers: authorization ? { authorization } : {}, body }, response)).then(() => response);
}

test("sign endpoint accepts only authenticated owner metadata and returns a constrained server-derived signature", async () => {
  const harness = createHarness();
  const response = await request(harness.api.signUpload, { body: { catchId, photoId, size: 1024, contentType: "image/jpeg", sha256 } });
  const publicId = cloudinaryPublicId(ownerId, catchId, photoId);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.params, { public_id: publicId, type: "authenticated", overwrite: true, context: `sha256=${sha256}` });
  assert.equal(response.body.resourceType, "image");
  assert.equal(response.body.signature, "b".repeat(64));
  assert.equal(harness.signed[0].secret, "test-only-secret");
  assert.equal(harness.signed[0].params.public_id, publicId);
  assert.equal(Object.hasOwn(response.body, "apiSecret"), false);
  assert.equal(Object.hasOwn(response.body, "secret"), false);
});

test("sign endpoint denies absent/invalid tokens, foreign owner, extra uid/public ID, and invalid metadata", async () => {
  const harness = createHarness();
  assert.equal((await request(harness.api.signUpload, { authorization: null, body: { catchId, photoId, size: 1024, contentType: "image/jpeg", sha256 } })).statusCode, 401);
  assert.equal((await request(harness.api.signUpload, { authorization: "Bearer invalid-token", body: { catchId, photoId, size: 1024, contentType: "image/jpeg", sha256 } })).statusCode, 401);
  assert.equal((await request(harness.api.signUpload, { authorization: "Bearer owner-b-token", body: { catchId, photoId, size: 1024, contentType: "image/jpeg", sha256 } })).statusCode, 403);
  assert.equal((await request(harness.api.signUpload, { body: { catchId, photoId, uid: ownerId, size: 1024, contentType: "image/jpeg", sha256 } })).statusCode, 400);
  assert.equal((await request(harness.api.signUpload, { body: { catchId, photoId, public_id: "arbitrary", size: 1024, contentType: "image/jpeg", sha256 } })).statusCode, 400);
  assert.equal((await request(harness.api.signUpload, { body: { catchId: "../foreign", photoId, size: 1024, contentType: "image/jpeg", sha256 } })).statusCode, 400);
  assert.equal((await request(harness.api.signUpload, { body: { catchId, photoId, size: MAX_PHOTO_BYTES + 1, contentType: "image/jpeg", sha256 } })).statusCode, 400);
  assert.equal((await request(harness.api.signUpload, { body: { catchId, photoId, size: 1024, contentType: "image/svg+xml", sha256 } })).statusCode, 400);
});

test("photo API distinguishes missing auth, malformed bearer headers, and expired Firebase tokens", async () => {
  const malformed = createHarness();
  const malformedResponse = await request(malformed.api.signUpload, { authorization: "Bearer token with spaces" });
  assert.equal(malformedResponse.statusCode, 401);
  assert.equal(malformedResponse.body.error, "invalid_auth_header");

  const missing = createHarness();
  const missingResponse = await request(missing.api.signUpload, { authorization: null });
  assert.equal(missingResponse.statusCode, 401);
  assert.equal(missingResponse.body.error, "missing_auth");

  const expiredApi = createCloudinaryApi({
    env: createEnabledTestEnvironment(),
    verifyToken: async () => { throw Object.assign(new Error("private verifier detail"), { code: "auth/id-token-expired" }); },
  });
  const expiredResponse = await request(expiredApi.signUpload);
  assert.equal(expiredResponse.statusCode, 401);
  assert.equal(expiredResponse.body.error, "firebase_token_expired");
  assert.doesNotMatch(JSON.stringify(expiredResponse.body), /private verifier detail/);
});

test("Firebase auth diagnostics log only a safe route, class, step, and HTTP status", async () => {
  const logged = [];
  const api = createCloudinaryApi({
    env: createEnabledTestEnvironment(),
    verifyToken: async () => { throw Object.assign(new Error("private token and credential detail"), { code: "auth/id-token-revoked" }); },
    logAuthFailure: (entry) => logged.push(entry),
  });
  const response = await request(api.signUpload);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(logged, [{ route: "/api/cloudinary/sign", errorClass: "firebase_token_revoked", step: "verifyIdToken", httpStatus: 401 }]);
  assert.equal(classifyFirebaseAuthFailure({ code: "unexpected-sensitive-code", message: "private" }), "firebase_token_verify_error");
  assert.doesNotMatch(JSON.stringify(logged), /private|token and credential detail|unexpected-sensitive-code/);
});

test("Firebase Admin project mismatches and unusable private keys receive safe config classifications", async () => {
  const mismatchedCredentials = JSON.parse(createEnabledTestEnvironment().FIREBASE_SERVICE_ACCOUNT_JSON);
  mismatchedCredentials.project_id = "wrong-project";
  const mismatchApi = createCloudinaryApi({ env: createEnabledTestEnvironment({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(mismatchedCredentials) }) });
  assert.deepEqual((await request(mismatchApi.capability, { method: "GET" })).body, { enabled: false, reason: "firebase_project_mismatch" });
  assert.equal((await request(mismatchApi.signUpload)).body.error, "server_auth_unavailable");

  const invalidCredentials = JSON.parse(createEnabledTestEnvironment().FIREBASE_SERVICE_ACCOUNT_JSON);
  invalidCredentials.private_key = "not a PEM key";
  const invalidApi = createCloudinaryApi({ env: createEnabledTestEnvironment({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(invalidCredentials) }) });
  assert.deepEqual((await request(invalidApi.capability, { method: "GET" })).body, { enabled: false, reason: "firebase_admin_service_account_invalid" });
});

test("sign endpoint rejects missing Cloudinary or Firebase Admin production configuration without touching providers", async () => {
  const api = createCloudinaryApi({ env: createEnabledTestEnvironment({ FIREBASE_SERVICE_ACCOUNT_JSON: undefined }), getCloudinary: async () => { throw new Error("must not run"); } });
  assert.deepEqual((await request(api.capability, { method: "GET", authorization: null })).body, { enabled: false, reason: "firebase_admin_env_missing" });
  const response = await request(api.signUpload, { body: { catchId, photoId, size: 1024, contentType: "image/jpeg", sha256 } });
  assert.equal(response.statusCode, 503);
});

test("service account loading distinguishes missing env, JSON parsing, and structure failures", async () => {
  const valid = createEnabledTestEnvironment();
  for (const [value, code, step] of [
    [undefined, "firebase_admin_env_missing", "env_load"],
    ["{invalid", "firebase_admin_json_parse_error", "json_parse"],
    ["{}", "firebase_admin_service_account_invalid", "service_account_validation"],
  ]) {
    const env = { ...valid, FIREBASE_SERVICE_ACCOUNT_JSON: value };
    assert.throws(() => readFirebaseServiceAccount(env), (error) => error.code === code && error.step === step && error.statusCode === 503);
    const logged = [];
    const api = createCloudinaryApi({ env, logAuthFailure: (entry) => logged.push(entry) });
    const response = await request(api.signUpload);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { error: "server_auth_unavailable", message: "Authentication service is temporarily unavailable." });
    assert.deepEqual(logged, [{ route: "/api/cloudinary/sign", errorClass: code, step, httpStatus: 503 }]);
  }
});

test("Firebase Admin initialization identifies each failing SDK call", async () => {
  const account = readFirebaseServiceAccount(createEnabledTestEnvironment());
  const app = { name: "chytnucz-cloudinary-server" };
  const operations = {
    getApps: () => [],
    cert: () => ({}),
    initializeApp: () => app,
    getAuth: () => ({ verifyIdToken: async () => ({ uid: ownerId }) }),
    getFirestore: () => ({}),
  };
  const failures = [
    ["getApps", "firebase_admin_initialize_app_error", "initializeApp"],
    ["cert", "firebase_admin_cert_error", "cert"],
    ["initializeApp", "firebase_admin_initialize_app_error", "initializeApp"],
    ["getAuth", "firebase_admin_get_auth_error", "getAuth"],
    ["getFirestore", "firebase_admin_get_firestore_error", "getFirestore"],
  ];
  for (const [failure, code, step] of failures) {
    const override = { ...operations, [failure]: () => { throw new Error("private credential detail"); } };
    await assert.rejects(initializeFirebaseAdminContext(account, override), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.step, step);
      assert.equal(error.statusCode, 503);
      assert.doesNotMatch(error.message, /private credential detail/);
      return true;
    }, failure);
  }
  assert.ok((await initializeFirebaseAdminContext(account, operations)).auth);
});

test("existing named Firebase app is reused without another cert or initializeApp", async () => {
  const account = readFirebaseServiceAccount(createEnabledTestEnvironment());
  const existing = { name: "chytnucz-cloudinary-server" };
  const context = await initializeFirebaseAdminContext(account, {
    getApps: () => [existing],
    cert: () => { throw new Error("unexpected cert"); },
    initializeApp: () => { throw new Error("unexpected init"); },
    getAuth: (app) => { assert.equal(app, existing); return {}; },
    getFirestore: (app) => { assert.equal(app, existing); return {}; },
  });
  assert.ok(context.auth);
  assert.ok(context.db);
});

test("unknown Firebase token verification errors return 503 without leaking SDK details", async () => {
  const logged = [];
  const api = createCloudinaryApi({
    env: createEnabledTestEnvironment(),
    verifyToken: async () => { throw Object.assign(new Error("private Firebase SDK detail"), { step: "private credential path" }); },
    logAuthFailure: (entry) => logged.push(entry),
  });
  const response = await request(api.signUpload);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: "server_auth_unavailable", message: "Authentication service is temporarily unavailable." });
  assert.deepEqual(logged, [{ route: "/api/cloudinary/sign", errorClass: "firebase_token_verify_error", step: "verifyIdToken", httpStatus: 503 }]);
  assert.doesNotMatch(JSON.stringify({ logged, response: response.body }), /private Firebase SDK detail|private credential path/);
});

test("production token verifier accepts valid tokens, keeps invalid tokens at 401, and maps SDK failures to 503", async () => {
  const calls = [];
  const identity = await verifyFirebaseIdToken({ verifyIdToken: async (token, checkRevoked) => {
    calls.push({ token, checkRevoked });
    return { uid: ownerId };
  } }, "test-token");
  assert.deepEqual(identity, { uid: ownerId });
  assert.deepEqual(calls, [{ token: "test-token", checkRevoked: true }]);

  for (const code of ["auth/id-token-expired", "auth/id-token-revoked", "auth/argument-error", "auth/invalid-id-token"]) {
    await assert.rejects(verifyFirebaseIdToken({ verifyIdToken: async () => { throw Object.assign(new Error("private"), { code }); } }, "test-token"),
      (error) => error.code === code && error.step === "verifyIdToken" && error.statusCode === 401 && error.message !== "private");
  }
  await assert.rejects(verifyFirebaseIdToken({ verifyIdToken: async () => { throw new Error("private credential detail"); } }, "test-token"),
    (error) => error.code === "firebase_token_verify_error" && error.step === "verifyIdToken" && error.statusCode === 503 && !error.message.includes("private"));
});

test("Cloudinary upload response is verified against actual authenticated image metadata", async () => {
  const harness = createHarness();
  const response = await request(harness.api.verifyUpload, { body: { catchId, photoId, bytes: 1024, format: "jpg" } });
  assert.deepEqual(response.body, { verified: true, bytes: 1024, format: "jpg" });
  assert.deepEqual(harness.reads.find((item) => item.resource).resource, [cloudinaryPublicId(ownerId, catchId, photoId), { resource_type: "image", type: "authenticated", context: true }]);
  const mismatch = createHarness({ resource: { public_id: "foreign/public/id", resource_type: "image", type: "authenticated", bytes: 1024, format: "jpg" } });
  assert.equal((await request(mismatch.api.verifyUpload, { body: { catchId, photoId, bytes: 1024, format: "jpg" } })).statusCode, 409);
});

test("recovery accepts only a cloud asset carrying the signed SHA-256 context", async () => {
  const resource = { public_id: cloudinaryPublicId(ownerId, catchId, photoId), resource_type: "image",
    type: "authenticated", bytes: 1024, format: "jpg", context: { custom: { sha256 } } };
  const valid = createHarness({ resource });
  assert.equal((await request(valid.api.verifyUpload, { body: { catchId, photoId, bytes: 1024, format: "jpg", sha256 } })).statusCode, 200);
  const different = createHarness({ resource: { ...resource, context: { custom: { sha256: "b".repeat(64) } } } });
  assert.equal((await request(different.api.verifyUpload, { body: { catchId, photoId, bytes: 1024, format: "jpg", sha256 } })).statusCode, 409);
  const legacy = createHarness({ resource: { ...resource, context: undefined } });
  assert.equal((await request(legacy.api.verifyUpload, { body: { catchId, photoId, bytes: 1024, format: "jpg", sha256 } })).statusCode, 409);
});

test("deletion just before verify-upload rejects the stale upload without reading Cloudinary", async () => {
  let deleted = false;
  const harness = createHarness({ access: () => makePhotoAccess(ownerId, { deleted }) });
  const signed = await request(harness.api.signUpload, { body: { catchId, photoId, size: 1024, contentType: "image/jpeg", sha256 } });
  assert.equal(signed.statusCode, 200);
  deleted = true;
  const verified = await request(harness.api.verifyUpload, { body: { catchId, photoId, bytes: 1024, format: "jpg" } });
  assert.equal(verified.statusCode, 403);
  assert.equal(harness.reads.some((item) => item.resource), false);
  const removed = await request(harness.api.remove);
  assert.equal(removed.statusCode, 202);
  assert.equal(harness.scheduledDeletes.length, 1, "an uploaded asset remains eligible for server cleanup");
});

test("delivery returns a five-minute authenticated URL only for Firestore-synced owner photos", async () => {
  const harness = createHarness();
  const response = await request(harness.api.delivery);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.url, "https://api.cloudinary.com/short-lived-private-url");
  assert.equal(response.body.expiresAt, Math.floor(Date.parse("2026-10-21T12:00:00.000Z") / 1000) + 300);
  assert.deepEqual(harness.deliveries[0], { publicId: cloudinaryPublicId(ownerId, catchId, photoId), format: "jpg", options: {
    resource_type: "image", type: "authenticated", expires_at: response.body.expiresAt,
  } });
  const foreign = createHarness();
  assert.equal((await request(foreign.api.delivery, { authorization: "Bearer owner-b-token" })).statusCode, 403);
});

test("account export returns only verified binary bytes from the authenticated owner's cloud photo", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
  const photoAccess = makePhotoAccess();
  photoAccess.photoRecord.size = bytes.byteLength;
  photoAccess.photoRecord.cloud.sha256 = createHash("sha256").update(bytes).digest("hex");
  let remoteRequest;
  const harness = createHarness({ access: photoAccess, fetchImpl: async (url, options) => {
    remoteRequest = { url, options };
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer };
  } });
  const response = await request(harness.api.exportPhoto);
  assert.equal(response.statusCode, 200);
  assert.deepEqual([...response.body], [...bytes]);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["Content-Type"], "image/jpeg");
  assert.deepEqual(remoteRequest, { url: "https://api.cloudinary.com/short-lived-private-url",
    options: { method: "GET", redirect: "manual", cache: "no-store" } });
  assert.equal(harness.deliveries[0].options.expires_at,
    Math.floor(Date.parse("2026-10-21T12:00:00.000Z") / 1000) + 300);

  const foreign = createHarness({ access: photoAccess, fetchImpl: async () => assert.fail("foreign owner must not reach Cloudinary") });
  assert.equal((await request(foreign.api.exportPhoto, { authorization: "Bearer owner-b-token" })).statusCode, 403);
  const corrupted = createHarness({ access: photoAccess, fetchImpl: async () => ({
    ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  }) });
  assert.equal((await request(corrupted.api.exportPhoto)).statusCode, 502);
});

test("photo download reports only the upstream HTTP status for delivery diagnostics", async () => {
  const unauthorized = createHarness({ fetchImpl: async () => ({ ok: false, status: 401 }) });
  const denied = await request(unauthorized.api.exportPhoto);
  assert.equal(denied.statusCode, 502);
  assert.deepEqual(denied.body, { error: "provider_download_failed", providerStatus: 401,
    message: "Cloud photo could not be downloaded." });

  const missing = createHarness({ fetchImpl: async () => ({ ok: false, status: 404 }) });
  const absent = await request(missing.api.exportPhoto);
  assert.equal(absent.statusCode, 404);
  assert.equal(absent.body.error, "photo_not_available");
  assert.equal(absent.body.providerStatus, 404);
});

test("photo export denies tampered Catch/photo IDs before requesting Cloudinary", async () => {
  const harness = createHarness({ fetchImpl: async () => assert.fail("Cloudinary must not be contacted for a foreign photo") });
  const foreignCatch = await request(harness.api.exportPhoto, { body: { catchId: "foreign-catch", photoId } });
  const foreignPhoto = await request(harness.api.exportPhoto, { body: { catchId, photoId: "foreign-photo" } });
  assert.equal(foreignCatch.statusCode, 403);
  assert.equal(foreignPhoto.statusCode, 403);
  assert.deepEqual(harness.deliveries, []);
});

test("photo export derives its owner from the verified token and rejects client identity fields", async () => {
  const received = [];
  const bytes = new Uint8Array([1, 2, 3]);
  const ownerPhoto = makePhotoAccess();
  ownerPhoto.photoRecord.size = bytes.byteLength;
  ownerPhoto.photoRecord.cloud.sha256 = createHash("sha256").update(bytes).digest("hex");
  const harness = createHarness({ access: (uid) => {
    received.push(uid);
    return ownerPhoto;
  }, fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer }) });
  const allowed = await request(harness.api.exportPhoto, { body: { catchId, photoId } });
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(received, [ownerId]);

  for (const field of ["uid", "ownerId", "email"]) {
    const requestBody = { catchId, photoId, [field]: otherOwnerId };
    const rejected = await request(harness.api.exportPhoto, { body: requestBody });
    assert.equal(rejected.statusCode, 400, `${field} must not be accepted from the client`);
  }
  assert.equal((await request(harness.api.exportPhoto, { authorization: null })).statusCode, 401);
  assert.equal((await request(harness.api.exportPhoto, { authorization: "Bearer invalid-token" })).statusCode, 401);
  assert.equal((await request(harness.api.exportPhoto, { authorization: "Bearer abc.def.not-a-valid-signature" })).statusCode, 401);

  const userA = createHarness({ access: makePhotoAccess(otherOwnerId) });
  assert.equal((await request(userA.api.exportPhoto, { authorization: "Bearer owner-a-token" })).statusCode, 403);
  assert.equal((await request(userA.api.exportPhoto, {
    authorization: "Bearer owner-a-token", body: { catchId: "foreign-catch", photoId: "foreign-photo" },
  })).statusCode, 403);
});

test("large account export photos are streamed after server-side SHA-256 validation", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x02]);
  const photoAccess = makePhotoAccess();
  photoAccess.photoRecord.size = bytes.byteLength;
  photoAccess.photoRecord.cloud.sha256 = createHash("sha256").update(bytes).digest("hex");
  const chunks = [];
  const response = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  response.on("error", (error) => { response.pipelineError = error; });
  response.headers = {};
  response.statusCode = null;
  response.setHeader = function setHeader(key, value) { this.headers[key] = value; };
  response.status = function status(statusCode) { this.statusCode = statusCode; return this; };
  response.json = function json(payload) { this.body = payload; return this; };
  const harness = createHarness({ access: photoAccess, fetchImpl: async () => new Response(bytes) });
  await harness.api.exportPhoto({ method: "POST", headers: { authorization: "Bearer owner-a-token" }, body: { catchId, photoId } }, response);
  assert.equal(response.statusCode, 200, `${JSON.stringify(response.body)} ${response.pipelineError?.message ?? ""}`);
  assert.equal(response.headers["Content-Type"], "image/jpeg");
  assert.deepEqual([...Buffer.concat(chunks)], [...bytes]);
});

test("delete endpoint validates owner tombstone and queues server-derived deletion instead of deleting immediately", async () => {
  const harness = createHarness({ access: makePhotoAccess(ownerId, { deleted: true }), deleteResult: { result: "not found" } });
  const response = await request(harness.api.remove);
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { deleted: true, queued: true, jobId: "stable-delete-job", deleteAfter: "2026-10-22T12:00:00.000Z" });
  assert.deepEqual(harness.scheduledDeletes[0], { ownerId, catchId, photoId });
  assert.deepEqual(harness.deletes, [], "HTTP delete request must enqueue only; provider destroy belongs to the server worker");
  const active = createHarness();
  assert.equal((await request(active.api.remove)).statusCode, 403);
  assert.equal((await request(harness.api.remove, { body: { catchId, photoId, publicId: "arbitrary/asset" } })).statusCode, 400);
  assert.equal((await request(harness.api.remove, { body: { catchId, photoId, public_id: "arbitrary/asset" } })).statusCode, 400);
  const foreign = createHarness({ access: makePhotoAccess(otherOwnerId, { deleted: true }) });
  assert.equal((await request(foreign.api.remove, { authorization: "Bearer owner-a-token" })).statusCode, 403);
  assert.deepEqual(foreign.scheduledDeletes, []);
  const mismatchedCloud = makePhotoAccess(ownerId, { deleted: true });
  mismatchedCloud.photoRecord.cloud.objectKey = `users/${otherOwnerId}/catches/${catchId}/photos/${photoId}/original`;
  const mismatched = createHarness({ access: mismatchedCloud });
  assert.equal((await request(mismatched.api.remove)).statusCode, 403);
  assert.deepEqual(mismatched.scheduledDeletes, []);
});

test("API routes enforce POST and per-user rate limits", async () => {
  const method = createHarness();
  assert.equal((await request(method.api.signUpload, { method: "GET" })).statusCode, 405);
  const limited = createHarness({ rateAllowed: false });
  assert.equal((await request(limited.api.delivery)).statusCode, 429);
  assert.equal((await request(limited.api.exportPhoto)).statusCode, 429);
});
