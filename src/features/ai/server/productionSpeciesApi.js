import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { AI_FEATURES } from "../aiPolicy.js";
import { createSpeciesApi } from "./speciesApi.js";
import { createGeminiSpeciesProvider } from "./geminiProvider.js";
import { getAccountDeletionAdminContext, verifyFirebaseIdToken, cloudinaryPublicId } from "../../../server/cloudinaryApi.js";

const MAX_ORIGINAL = 10 * 1024 * 1024;
const MAX_AI_IMAGE = 2 * 1024 * 1024;

// Lossless JPEG container rewrite: remove EXIF/XMP/IPTC/comments/ICC without
// decoding or changing pixels. Orientation may differ; AI receives no GPS/time.
// PNG/WebP and large JPEGs fail safely until a validated decoder is provided.
export function stripJpegMetadata(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Unsupported JPEG.");
  const chunks = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    const markerStart = offset;
    if (bytes[offset++] !== 0xff) throw new Error("Invalid JPEG marker.");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) throw new Error("Incomplete JPEG scan.");
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length >= bytes.length || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("Incomplete JPEG.");
      // A second metadata segment after a scan (progressive JPEG) requires a
      // full parser; reject instead of claiming metadata was stripped.
      for (let index = offset + length; index < bytes.length - 1; index += 1) {
        if (bytes[index] !== 0xff) continue;
        const next = bytes[index + 1];
        if (next === 0 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) { index += 1; continue; }
        if (next !== 0xd9 || index !== bytes.length - 2) throw new Error("Unsupported multi-scan JPEG.");
      }
      chunks.push(bytes.subarray(markerStart));
      const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
      let cursor = 0;
      for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length; }
      return result;
    }
    if (marker === 0xd9 || marker === 0 || (marker >= 0xd0 && marker <= 0xd8) || marker === 1 || offset + 2 > bytes.length) throw new Error("Invalid JPEG.");
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error("Incomplete JPEG segment.");
    const adobeColourMarker = marker === 0xee && length === 14
      && String.fromCharCode(...bytes.subarray(offset + 2, offset + 7)) === "Adobe";
    const metadata = (marker >= 0xe0 && marker <= 0xef && !adobeColourMarker) || marker === 0xfe;
    // APP14 carries Adobe colour transform information, not user EXIF.
    if (!metadata) chunks.push(bytes.subarray(markerStart, offset + length));
    offset += length;
  }
  throw new Error("JPEG scan missing.");
}

async function readLimited(response, maxBytes) {
  if (!response.ok || Number(response.headers?.get?.("content-length") ?? 0) > maxBytes || !response.body?.getReader) throw new Error("Photo unavailable.");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error("Photo too large.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new Uint8Array(Buffer.concat(chunks, length));
}

async function productionCloudinary(env) {
  const { v2 } = await import("cloudinary");
  if (!/^[a-z0-9-]{1,64}$/i.test(env.CLOUDINARY_CLOUD_NAME ?? "") || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) throw new Error("Photo cloud unavailable.");
  v2.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  return v2;
}

export function createFirebaseSpeciesDependencies({ env, admin = () => getAccountDeletionAdminContext(env),
  cloudinary = () => productionCloudinary(env), fetchImpl = globalThis.fetch, now = () => Date.now(),
  verifyIdentity = verifyFirebaseIdToken } = {}) {
  return {
    verifyToken: async (token) => {
      const { auth, db } = await admin();
      const identity = await verifyIdentity(auth, token);
      if (typeof identity?.uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(identity.uid)
        || (await db.doc(`accountDeletions/${identity.uid}`).get()).exists) throw new Error("Account unavailable.");
      return identity;
    },
    getConsent: async (uid) => {
      const { db } = await admin();
      const [deleted, snapshot] = await Promise.all([db.doc(`accountDeletions/${uid}`).get(), db.doc(`users/${uid}/aiPreferences/consent`).get()]);
      if (deleted.exists || !snapshot.exists) return null;
      const data = snapshot.data();
      return data.ownerId === uid ? data : null;
    },
    consumeRateLimit: async (uid) => {
      const { db, Timestamp } = await admin();
      const ref = db.doc(`serverRateLimits/ai-species-${createHash("sha256").update(uid).digest("hex")}`);
      const day = Math.floor(now() / 86_400_000);
      const minute = Math.floor(now() / 60_000);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const previous = snapshot.exists ? snapshot.data() : {};
        const dailyCount = previous.day === day ? Number(previous.dailyCount) || 0 : 0;
        const minuteCount = previous.minute === minute ? Number(previous.minuteCount) || 0 : 0;
        if (dailyCount >= 20 || minuteCount >= 3) return false;
        transaction.set(ref, { day, minute, dailyCount: dailyCount + 1, minuteCount: minuteCount + 1,
          expiresAt: Timestamp.fromMillis((day + 2) * 86_400_000) });
        return true;
      });
    },
    getOwnedPhoto: async (uid, catchId, photoId) => {
      const { db } = await admin();
      const [deleted, catchSnapshot, photoSnapshot] = await Promise.all([
        db.doc(`accountDeletions/${uid}`).get(), db.doc(`users/${uid}/catches/${catchId}`).get(),
        db.doc(`users/${uid}/catches/${catchId}/photos/${photoId}`).get(),
      ]);
      if (deleted.exists || !catchSnapshot.exists || !photoSnapshot.exists) return null;
      const record = catchSnapshot.data(), photo = photoSnapshot.data();
      if (record.ownerId !== uid || record.id !== catchId || record.deleted || record.photoRefs?.[photoId] !== true
        || photo.id !== photoId || photo.deleted || photo.cloud?.state !== "synced" || photo.cloud.provider !== "cloudinary"
        || photo.cloud.objectKey !== `users/${uid}/catches/${catchId}/photos/${photoId}/original`
        || !/^[a-f0-9]{64}$/.test(photo.cloud.sha256 ?? "") || photo.type !== "image/jpeg"
        || !Number.isSafeInteger(photo.size) || photo.size <= 0 || photo.size > MAX_ORIGINAL) return null;
      const sdk = await cloudinary();
      const url = new URL(sdk.utils.private_download_url(cloudinaryPublicId(uid, catchId, photoId), "jpg", {
        resource_type: "image", type: "authenticated", expires_at: Math.floor(now() / 1000) + 60,
      }));
      if (url.protocol !== "https:" || !["api.cloudinary.com", "res.cloudinary.com"].includes(url.hostname)) throw new Error("Invalid photo host.");
      const response = await fetchImpl(url.href, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const original = await readLimited(response, MAX_ORIGINAL);
      if (original.length !== photo.size || createHash("sha256").update(original).digest("hex") !== photo.cloud.sha256) throw new Error("Photo digest mismatch.");
      const bytes = stripJpegMetadata(original);
      if (bytes.length > MAX_AI_IMAGE) throw new Error("AI photo too large.");
      return { ownerId: uid, catchId, photoId, bytes, mimeType: "image/jpeg", metadataStripped: true };
    },
  };
}

export function createProductionSpeciesApi({ env = globalThis.process?.env ?? {} } = {}) {
  // Both a reviewed source release and server configuration are required.
  const enabled = AI_FEATURES.species === true && env.AI_SPECIES_ENABLED === "true" && env.AI_PROVIDER === "gemini";
  if (!enabled) return createSpeciesApi();
  try {
    return createSpeciesApi({ enabled, providerName: "gemini", ...createFirebaseSpeciesDependencies({ env }),
      provider: createGeminiSpeciesProvider({ apiKey: env.AI_GEMINI_API_KEY, model: env.AI_GEMINI_MODEL }) });
  } catch { return createSpeciesApi(); }
}
