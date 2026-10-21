import { createHash, createPrivateKey, generateKeyPairSync } from "node:crypto";

export const FIREBASE_PROJECT_ID = "chutnucz";
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SHA_PATTERN = /^[a-f0-9]{64}$/;
const RATE_LIMITS = Object.freeze({ sign: 20, verify: 30, delivery: 120, delete: 20, metadata: 120 });
const RATE_WINDOW_MS = 60_000;

function send(res, status, payload) {
  res.setHeader?.("Cache-Control", "no-store");
  return res.status(status).json(payload);
}

function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req.body !== "string" || new TextEncoder().encode(req.body).length > 4096) return null;
  try {
    const body = JSON.parse(req.body);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function hasOnlyKeys(body, keys) {
  return Object.keys(body).every((key) => keys.includes(key));
}

function validIds(body) {
  return typeof body.catchId === "string" && ID_PATTERN.test(body.catchId)
    && typeof body.photoId === "string" && ID_PATTERN.test(body.photoId);
}

export function cloudinaryPublicId(uid, catchId, photoId) {
  if (typeof uid !== "string" || !uid || uid.includes("/") || !validIds({ catchId, photoId })) {
    throw Object.assign(new Error("Invalid photo identity."), { statusCode: 400, code: "invalid_request" });
  }
  return `chytnucz/users/${uid}/catches/${catchId}/photos/${photoId}/original`;
}

function expectedFormat(contentType) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[contentType] ?? null;
}

function activePhotoAccess(access, uid, catchId, photoId) {
  return access?.catchRecord?.ownerId === uid
    && access.catchRecord.id === catchId
    && access.catchRecord.deleted !== true
    && access.catchRecord.photoRefs?.[photoId] === true
    && access.photoRecord?.id === photoId
    && access.photoRecord.deleted !== true;
}

function deletePhotoAccess(access, uid, catchId, photoId) {
  return access?.catchRecord?.ownerId === uid
    && access.catchRecord.id === catchId
    && access.photoRecord?.id === photoId
    && (access.catchRecord.deleted === true || access.photoRecord.deleted === true
      || access.catchRecord.photoRefs?.[photoId] !== true);
}

function configurationError(env) {
  if (env.PHOTO_CLOUD_PROVIDER !== "cloudinary"
    || !env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET
    || !/^[a-z0-9-]{1,64}$/i.test(env.CLOUDINARY_CLOUD_NAME)
    || !/^[0-9]{5,32}$/.test(env.CLOUDINARY_API_KEY)) return "photo_cloud_unavailable";
  let firebaseCredentials;
  try { firebaseCredentials = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON ?? ""); }
  catch { return "firebase_admin_config_invalid"; }
  if (!firebaseCredentials || typeof firebaseCredentials !== "object" || Array.isArray(firebaseCredentials)
    || typeof firebaseCredentials.private_key !== "string" || typeof firebaseCredentials.client_email !== "string") {
    return "firebase_admin_config_invalid";
  }
  if (firebaseCredentials.project_id !== FIREBASE_PROJECT_ID) return "firebase_project_mismatch";
  try { createPrivateKey(firebaseCredentials.private_key); }
  catch { return "firebase_admin_config_invalid"; }
  return null;
}

function disabledResponse(res) {
  return send(res, 503, { error: "photo_cloud_unavailable", message: "Photo cloud storage is not configured." });
}

function safeError(res, error) {
  const status = [400, 401, 403, 404, 409, 429, 503].includes(error?.statusCode) ? error.statusCode : 502;
  const code = typeof error?.code === "string" && /^[a-z0-9_-]{1,64}$/.test(error.code) ? error.code : "provider_error";
  return send(res, status, { error: code, message: status === 401 ? "Authentication is required." : status === 403 ? "Photo access is not allowed." : status === 429 ? "Photo cloud request limit reached." : "Photo cloud request could not be completed." });
}

export function classifyFirebaseAuthFailure(error, phase = "token_verification") {
  if (error?.code === "firebase_admin_not_configured") return "firebase_admin_config_missing";
  if (error?.code === "firebase_admin_config_invalid") return "firebase_admin_config_invalid";
  if (error?.code === "firebase_project_mismatch") return "firebase_project_mismatch";
  if (["app/invalid-credential", "auth/invalid-credential"].includes(error?.code)) return "firebase_invalid_credential";
  if (phase === "admin_init") return "firebase_admin_init_error";
  if (error?.code === "auth/id-token-expired") return "firebase_token_expired";
  if (error?.code === "auth/id-token-revoked") return "firebase_token_revoked";
  if (error?.code === "auth/argument-error") return "firebase_argument_error";
  if (error?.code === "auth/invalid-id-token") return "firebase_token_invalid";
  return "firebase_unknown_auth_error";
}

export function createCloudinaryApi({
  env = globalThis.process?.env ?? {},
  verifyToken,
  getPhotoAccess,
  consumeRateLimit = async () => true,
  getCloudinary,
  now = () => Date.now(),
  logAuthFailure = () => {},
} = {}) {
  async function prepare(req, res, allowedKeys, action) {
    if (req.method !== "POST") {
      res.setHeader?.("Allow", "POST");
      send(res, 405, { error: "method_not_allowed", message: "Use POST." });
      return null;
    }
    const configError = configurationError(env);
    if (configError) {
      if (configError === "photo_cloud_unavailable") disabledResponse(res);
      else send(res, 503, { error: configError, message: "Photo cloud service is temporarily unavailable." });
      return null;
    }
    const authorization = req.headers?.authorization ?? req.headers?.Authorization;
    if (authorization === undefined || authorization === null || authorization === "") {
      send(res, 401, { error: "missing_auth", message: "Authentication is required." });
      return null;
    }
    const bearer = typeof authorization === "string" ? authorization.match(/^Bearer ([^\s]+)$/) : null;
    if (!bearer) {
      send(res, 401, { error: "invalid_auth_header", message: "Authentication header is invalid." });
      return null;
    }
    let identity;
    try { identity = await verifyToken(bearer[1], action); } catch (error) {
      logAuthFailure({ action, errorClass: classifyFirebaseAuthFailure(error) });
      if (["auth/id-token-expired", "auth/id-token-revoked", "auth/argument-error"].includes(error?.code)) {
        const code = error.code === "auth/id-token-expired" ? "firebase_token_expired" : "invalid_auth";
        send(res, 401, { error: code, message: "Authentication is required." });
        return null;
      }
      if (error?.statusCode === 503 || error?.code === "app/invalid-credential" || error?.code === "auth/invalid-credential") {
        send(res, 503, { error: error?.statusCode === 503 ? error.code : "firebase_admin_config_invalid", message: "Photo cloud service is temporarily unavailable." });
        return null;
      }
      send(res, 401, { error: "invalid_auth", message: "Authentication is required." });
      return null;
    }
    if (typeof identity?.uid !== "string" || !identity.uid || identity.uid.length > 128 || identity.uid.includes("/")) {
      send(res, 403, { error: "invalid_owner", message: "Photo access is not allowed." });
      return null;
    }
    const body = parseBody(req);
    if (!body || !hasOnlyKeys(body, allowedKeys) || !validIds(body)) {
      send(res, 400, { error: "invalid_request", message: "Photo request is invalid." });
      return null;
    }
    let allowed;
    try { allowed = await consumeRateLimit(identity.uid, action, RATE_LIMITS[action], RATE_WINDOW_MS, now()); }
    catch { send(res, 503, { error: "rate_limit_unavailable", message: "Photo cloud service is temporarily unavailable." }); return null; }
    if (!allowed) {
      send(res, 429, { error: "rate_limited", message: "Photo cloud request limit reached." });
      return null;
    }
    return { uid: identity.uid, body };
  }

  async function signUpload(req, res) {
    const request = await prepare(req, res, ["catchId", "photoId", "size", "contentType", "sha256"], "sign");
    if (!request) return;
    const { uid, body } = request;
    if (!Number.isInteger(body.size) || body.size < 1 || body.size > MAX_PHOTO_BYTES
      || !ALLOWED_PHOTO_TYPES.includes(body.contentType) || typeof body.sha256 !== "string" || !SHA_PATTERN.test(body.sha256)) {
      return send(res, 400, { error: "invalid_photo", message: "Photo metadata is invalid." });
    }
    try {
      const access = await getPhotoAccess(uid, body.catchId, body.photoId);
      if (!activePhotoAccess(access, uid, body.catchId, body.photoId)) {
        return send(res, 403, { error: "photo_not_owned", message: "Photo access is not allowed." });
      }
      if (access.photoRecord.size !== body.size || access.photoRecord.type !== body.contentType) {
        return send(res, 409, { error: "photo_metadata_mismatch", message: "Photo metadata has changed." });
      }
      const cloudinary = await getCloudinary(env);
      const timestamp = Math.floor(now() / 1000);
      const params = {
        public_id: cloudinaryPublicId(uid, body.catchId, body.photoId),
        type: "authenticated",
        overwrite: true,
        timestamp,
      };
      const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);
      return send(res, 200, {
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        resourceType: "image",
        timestamp,
        signature,
        params: { public_id: params.public_id, type: params.type, overwrite: params.overwrite },
      });
    } catch (error) {
      return safeError(res, error);
    }
  }

  async function verifyUpload(req, res) {
    const request = await prepare(req, res, ["catchId", "photoId", "bytes", "format"], "verify");
    if (!request) return;
    const { uid, body } = request;
    if (!Number.isInteger(body.bytes) || typeof body.format !== "string") {
      return send(res, 400, { error: "invalid_upload_response", message: "Upload response is invalid." });
    }
    try {
      const access = await getPhotoAccess(uid, body.catchId, body.photoId);
      if (!activePhotoAccess(access, uid, body.catchId, body.photoId)) {
        return send(res, 403, { error: "photo_not_owned", message: "Photo access is not allowed." });
      }
      const cloudinary = await getCloudinary(env);
      const resource = await cloudinary.api.resource(cloudinaryPublicId(uid, body.catchId, body.photoId), {
        resource_type: "image", type: "authenticated",
      });
      const format = expectedFormat(access.photoRecord.type);
      if (resource.public_id !== cloudinaryPublicId(uid, body.catchId, body.photoId)
        || resource.resource_type !== "image" || resource.type !== "authenticated"
        || resource.bytes !== access.photoRecord.size || body.bytes !== resource.bytes
        || resource.format !== format || body.format !== resource.format) {
        return send(res, 409, { error: "upload_response_mismatch", message: "Uploaded photo could not be verified." });
      }
      return send(res, 200, { verified: true, bytes: resource.bytes, format: resource.format });
    } catch (error) {
      if (error?.http_code === 404 || error?.error?.http_code === 404) return send(res, 404, { error: "asset_not_found", message: "Uploaded photo was not found." });
      return safeError(res, error);
    }
  }

  async function delivery(req, res) {
    const request = await prepare(req, res, ["catchId", "photoId"], "delivery");
    if (!request) return;
    const { uid, body } = request;
    try {
      const access = await getPhotoAccess(uid, body.catchId, body.photoId);
      if (!activePhotoAccess(access, uid, body.catchId, body.photoId)) {
        return send(res, 403, { error: "photo_not_owned", message: "Photo access is not allowed." });
      }
      const expectedKey = `users/${uid}/catches/${body.catchId}/photos/${body.photoId}/original`;
      if (access.photoRecord.cloud?.provider !== "cloudinary" || access.photoRecord.cloud?.state !== "synced"
        || access.photoRecord.cloud.objectKey !== expectedKey || !SHA_PATTERN.test(access.photoRecord.cloud.sha256 ?? "")) {
        return send(res, 404, { error: "photo_not_available", message: "Photo is not available." });
      }
      const cloudinary = await getCloudinary(env);
      const format = expectedFormat(access.photoRecord.type);
      const expiresAt = Math.floor(now() / 1000) + 300;
      const url = cloudinary.utils.private_download_url(cloudinaryPublicId(uid, body.catchId, body.photoId), format, {
        resource_type: "image", type: "authenticated", expires_at: expiresAt,
      });
      return send(res, 200, { url, expiresAt });
    } catch (error) {
      return safeError(res, error);
    }
  }

  async function remove(req, res) {
    const request = await prepare(req, res, ["catchId", "photoId"], "delete");
    if (!request) return;
    const { uid, body } = request;
    try {
      const access = await getPhotoAccess(uid, body.catchId, body.photoId);
      if (!deletePhotoAccess(access, uid, body.catchId, body.photoId)) {
        return send(res, 403, { error: "photo_not_deleted", message: "Photo deletion is not allowed." });
      }
      const cloudinary = await getCloudinary(env);
      const result = await cloudinary.uploader.destroy(cloudinaryPublicId(uid, body.catchId, body.photoId), {
        resource_type: "image", type: "authenticated",
      });
      if (result?.result !== "ok" && result?.result !== "not found") {
        return send(res, 502, { error: "provider_delete_failed", message: "Cloudinary could not delete the photo." });
      }
      return send(res, 200, { deleted: true, alreadyMissing: result.result === "not found" });
    } catch (error) {
      return safeError(res, error);
    }
  }

  async function metadata(req, res) {
    const request = await prepare(req, res, ["catchId", "photoId"], "metadata");
    if (!request) return;
    const { uid, body } = request;
    try {
      const access = await getPhotoAccess(uid, body.catchId, body.photoId);
      if (!activePhotoAccess(access, uid, body.catchId, body.photoId)
        || access.photoRecord.cloud?.provider !== "cloudinary" || access.photoRecord.cloud?.state !== "synced") {
        return send(res, 404, { error: "photo_not_available", message: "Photo is not available." });
      }
      const cloudinary = await getCloudinary(env);
      const resource = await cloudinary.api.resource(cloudinaryPublicId(uid, body.catchId, body.photoId), {
        resource_type: "image", type: "authenticated",
      });
      return send(res, 200, {
        bytes: resource.bytes, format: resource.format, width: resource.width, height: resource.height,
        resourceType: resource.resource_type, type: resource.type,
      });
    } catch (error) {
      return safeError(res, error);
    }
  }

  async function capability(req, res) {
    if (req.method !== "GET") {
      res.setHeader?.("Allow", "GET");
      return send(res, 405, { error: "method_not_allowed", message: "Use GET." });
    }
    const error = configurationError(env);
    return send(res, 200, { enabled: error === null, ...(error && error !== "photo_cloud_unavailable" ? { reason: error } : {}) });
  }

  return { signUpload, verifyUpload, delivery, remove, metadata, capability };
}

let adminContextPromise;
async function getAdminContext(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw Object.assign(new Error("Firebase Admin credentials are not configured."), { statusCode: 503, code: "firebase_admin_not_configured" });
  adminContextPromise ??= (async () => {
    let serviceAccount;
    try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); }
    catch { throw Object.assign(new Error("Firebase Admin credentials are invalid."), { statusCode: 503, code: "firebase_admin_config_invalid" }); }
    if (!serviceAccount || typeof serviceAccount !== "object" || Array.isArray(serviceAccount)) {
      throw Object.assign(new Error("Firebase Admin credentials are invalid."), { statusCode: 503, code: "firebase_admin_config_invalid" });
    }
    if (serviceAccount.project_id !== FIREBASE_PROJECT_ID || typeof serviceAccount.private_key !== "string"
      || typeof serviceAccount.client_email !== "string") {
      const projectMismatch = serviceAccount.project_id !== FIREBASE_PROJECT_ID;
      throw Object.assign(new Error(projectMismatch ? "Firebase Admin credentials do not match the configured project." : "Firebase Admin credentials are invalid."), {
        statusCode: 503, code: projectMismatch ? "firebase_project_mismatch" : "firebase_admin_config_invalid",
      });
    }
    const [appApi, authApi, firestoreApi] = await Promise.all([
      import("firebase-admin/app"), import("firebase-admin/auth"), import("firebase-admin/firestore"),
    ]);
    const appName = "chytnucz-cloudinary-server";
    const app = appApi.getApps().find((candidate) => candidate.name === appName)
      ?? appApi.initializeApp({ credential: appApi.cert(serviceAccount), projectId: FIREBASE_PROJECT_ID }, appName);
    return { auth: authApi.getAuth(app), db: firestoreApi.getFirestore(app), Timestamp: firestoreApi.Timestamp };
  })();
  try { return await adminContextPromise; } catch (error) { adminContextPromise = null; throw error; }
}

async function getCloudinarySdk(env) {
  const { v2 } = await import("cloudinary");
  v2.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  return v2;
}

async function getPhotoAccess(env, uid, catchId, photoId) {
  const { db } = await getAdminContext(env);
  const [catchSnapshot, photoSnapshot] = await Promise.all([
    db.doc(`users/${uid}/catches/${catchId}`).get(),
    db.doc(`users/${uid}/catches/${catchId}/photos/${photoId}`).get(),
  ]);
  return {
    catchRecord: catchSnapshot.exists ? catchSnapshot.data() : null,
    photoRecord: photoSnapshot.exists ? photoSnapshot.data() : null,
  };
}

async function consumeDistributedRateLimit(env, uid, action, limit, windowMs, nowValue) {
  const { db, Timestamp } = await getAdminContext(env);
  const hashedUid = createHash("sha256").update(uid).digest("hex");
  const ref = db.collection("serverRateLimits").doc(`photo-cloud-${hashedUid}`);
  const window = Math.floor(nowValue / windowMs);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? snapshot.data() : {};
    const counts = previous.window === window ? previous.counts ?? {} : {};
    const count = counts[action] ?? 0;
    if (count >= limit) return false;
    const expiry = Timestamp.fromMillis((window + 2) * windowMs);
    transaction.set(ref, { window, counts: { ...counts, [action]: count + 1 }, expiresAt: expiry });
    return true;
  });
}

export function createProductionCloudinaryApi({ env = globalThis.process?.env ?? {}, now = () => Date.now() } = {}) {
  return createCloudinaryApi({
    env,
    verifyToken: async (token, action) => {
      let auth;
      try { auth = (await getAdminContext(env)).auth; }
      catch (error) {
        console.warn("cloudinary_auth_failure", { action, errorClass: classifyFirebaseAuthFailure(error, "admin_init") });
        throw error;
      }
      try { return await auth.verifyIdToken(token, true); }
      catch (error) {
        console.warn("cloudinary_auth_failure", { action, errorClass: classifyFirebaseAuthFailure(error) });
        throw error;
      }
    },
    getPhotoAccess: (uid, catchId, photoId) => getPhotoAccess(env, uid, catchId, photoId),
    consumeRateLimit: (uid, action, limit, windowMs, nowValue) => consumeDistributedRateLimit(env, uid, action, limit, windowMs, nowValue),
    getCloudinary: getCloudinarySdk,
    now,
  });
}

let testPrivateKey;
export function createEnabledTestEnvironment(overrides = {}) {
  testPrivateKey ??= generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    PHOTO_CLOUD_PROVIDER: "cloudinary",
    CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "1234567890",
    CLOUDINARY_API_SECRET: "test-only-secret",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: FIREBASE_PROJECT_ID, private_key: testPrivateKey, client_email: "test@example.test",
    }),
    ...overrides,
  };
}
