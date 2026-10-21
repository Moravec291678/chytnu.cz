import assert from "node:assert/strict";
import test from "node:test";
import { cloudinaryPublicId, createCloudinaryApi, createEnabledTestEnvironment, MAX_PHOTO_BYTES } from "./cloudinaryApi.js";

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
      if (token === "invalid-token") throw new Error("private verifier details");
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

test("sign endpoint rejects missing Cloudinary or Firebase Admin production configuration without touching providers", async () => {
  const api = createCloudinaryApi({ env: createEnabledTestEnvironment({ FIREBASE_SERVICE_ACCOUNT_JSON: undefined }), getCloudinary: async () => { throw new Error("must not run"); } });
  assert.deepEqual((await request(api.capability, { method: "GET", authorization: null })).body, { enabled: false });
  const response = await request(api.signUpload, { body: { catchId, photoId, size: 1024, contentType: "image/jpeg", sha256 } });
  assert.equal(response.statusCode, 503);
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
