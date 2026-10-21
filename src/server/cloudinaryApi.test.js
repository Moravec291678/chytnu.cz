import assert from "node:assert/strict";
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

function createHarness({ access = makePhotoAccess(), resource = null, deleteResult = { result: "ok" }, rateAllowed = true } = {}) {
  const signed = [];
  const reads = [];
  const deletes = [];
  const deliveries = [];
  const api = createCloudinaryApi({
    env: createEnabledTestEnvironment(),
    verifyToken: async (token) => {
      if (token === "invalid-token") throw Object.assign(new Error("private verifier details"), { code: "auth/invalid-id-token" });
      return { uid: token === "owner-b-token" ? otherOwnerId : ownerId };
    },
    getPhotoAccess: async (uid, receivedCatchId, receivedPhotoId) => {
      reads.push({ uid, catchId: receivedCatchId, photoId: receivedPhotoId });
      return typeof access === "function" ? access(uid, receivedCatchId, receivedPhotoId) : access;
    },
    consumeRateLimit: async () => rateAllowed,
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
  return { api, signed, reads, deletes, deliveries };
}

function request(handler, { method = "POST", authorization = "Bearer owner-a-token", body = { catchId, photoId } } = {}) {
  const response = { headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return Promise.resolve(handler({ method, headers: authorization ? { authorization } : {}, body }, response)).then(() => response);
}

test("sign endpoint accepts only authenticated owner metadata and returns a constrained server-derived signature", async () => {
  const harness = createHarness();
  const response = await request(harness.api.signUpload, { body: { catchId, photoId, size: 1024, contentType: "image/jpeg", sha256 } });
  const publicId = cloudinaryPublicId(ownerId, catchId, photoId);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.params, { public_id: publicId, type: "authenticated", overwrite: true });
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

test("Firebase Admin initialization identifies each failing import and SDK call", async () => {
  const account = readFirebaseServiceAccount(createEnabledTestEnvironment());
  const app = { name: "chytnucz-cloudinary-server" };
  const modules = {
    importApp: async () => ({ getApps: () => [], cert: () => ({}), initializeApp: () => app }),
    importAuth: async () => ({ getAuth: () => ({ verifyIdToken: async () => ({ uid: ownerId }) }) }),
    importFirestore: async () => ({ getFirestore: () => ({}), Timestamp: {} }),
  };
  const failures = [
    ["importApp", "firebase_admin_import_app_error", "import_app", "importApp"],
    ["importAuth", "firebase_admin_import_auth_error", "import_auth", "importAuth"],
    ["importFirestore", "firebase_admin_import_firestore_error", "import_firestore", "importFirestore"],
    ["getApps", "firebase_admin_initialize_app_error", "initializeApp", "importApp"],
    ["cert", "firebase_admin_cert_error", "cert", "importApp"],
    ["initializeApp", "firebase_admin_initialize_app_error", "initializeApp", "importApp"],
    ["getAuth", "firebase_admin_get_auth_error", "getAuth", "importAuth"],
    ["getFirestore", "firebase_admin_get_firestore_error", "getFirestore", "importFirestore"],
  ];
  for (const [failure, code, step, moduleName] of failures) {
    const override = { ...modules };
    if (failure.startsWith("import")) override[moduleName] = async () => { throw new Error("private credential detail"); };
    else {
      const original = await modules[moduleName]();
      override[moduleName] = async () => ({ ...original, [failure]: () => { throw new Error("private credential detail"); } });
    }
    await assert.rejects(initializeFirebaseAdminContext(account, override), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.step, step);
      assert.equal(error.statusCode, 503);
      assert.doesNotMatch(error.message, /private credential detail/);
      return true;
    }, failure);
  }
  assert.ok((await initializeFirebaseAdminContext(account, modules)).auth);
});

test("existing named Firebase app is reused without another cert or initializeApp", async () => {
  const account = readFirebaseServiceAccount(createEnabledTestEnvironment());
  const existing = { name: "chytnucz-cloudinary-server" };
  const context = await initializeFirebaseAdminContext(account, {
    importApp: async () => ({ getApps: () => [existing], cert: () => { throw new Error("unexpected cert"); }, initializeApp: () => { throw new Error("unexpected init"); } }),
    importAuth: async () => ({ getAuth: (app) => { assert.equal(app, existing); return {}; } }),
    importFirestore: async () => ({ getFirestore: (app) => { assert.equal(app, existing); return {}; }, Timestamp: {} }),
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
  assert.deepEqual(harness.reads.find((item) => item.resource).resource, [cloudinaryPublicId(ownerId, catchId, photoId), { resource_type: "image", type: "authenticated" }]);
  const mismatch = createHarness({ resource: { public_id: "foreign/public/id", resource_type: "image", type: "authenticated", bytes: 1024, format: "jpg" } });
  assert.equal((await request(mismatch.api.verifyUpload, { body: { catchId, photoId, bytes: 1024, format: "jpg" } })).statusCode, 409);
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

test("delete endpoint derives the target from owner tombstones and treats duplicate deletion as success", async () => {
  const harness = createHarness({ access: makePhotoAccess(ownerId, { deleted: true }), deleteResult: { result: "not found" } });
  const response = await request(harness.api.remove);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { deleted: true, alreadyMissing: true });
  assert.deepEqual(harness.deletes[0], [cloudinaryPublicId(ownerId, catchId, photoId), {
    resource_type: "image", type: "authenticated",
  }]);
  const active = createHarness();
  assert.equal((await request(active.api.remove)).statusCode, 403);
  const foreign = createHarness({ access: makePhotoAccess(otherOwnerId, { deleted: true }) });
  assert.equal((await request(foreign.api.remove, { authorization: "Bearer owner-a-token" })).statusCode, 403);
});

test("API routes enforce POST and per-user rate limits", async () => {
  const method = createHarness();
  assert.equal((await request(method.api.signUpload, { method: "GET" })).statusCode, 405);
  const limited = createHarness({ rateAllowed: false });
  assert.equal((await request(limited.api.delivery)).statusCode, 429);
});
