const KEY = "chytnu:photo-upload-trace:v1";
const EVENT = "chytnu:photo-upload-trace-changed";
const STAGES = new Set(["photo_selected", "photo_preparing", "blob_created", "photo_prepared", "indexeddb_saved", "job_created", "photo_queued", "sign_started", "sign_pass", "sign_fail", "cloud_upload_started", "cloud_upload_response", "cloud_upload_pass", "cloud_upload_fail", "photo_uploaded", "verify_started", "verify_pass", "verify_fail", "photo_verifying", "photo_persisting", "local_metadata_persisted", "photo_synced", "firestore_synced", "upload_fail"]);
const ERRORS = new Set(["missing_firebase_user", "invalid_auth", "firebase_token_invalid", "firebase_token_expired", "token_refresh_failed", "ownership_denied", "cloudinary_upload_failed", "cloudinary_upload_timeout", "cloudinary_network_error", "cloudinary_verification_failed", "photo_cloud_network_error", "photo_not_owned", "invalid_photo", "photo_prepare_failed", "photo_unsupported", "photo_too_large", "rate_limited", "invalid_grant", "upload_response_mismatch"]);
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "image/avif", "application/octet-stream"]);
const FORMATS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "avif", "unknown"];
function sanitize(photoId, stage, details = {}, timestamp = Date.now()) {
  if (typeof photoId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(photoId) || !STAGES.has(stage)) return null;
  const entry = { photoId, stage, timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() };
  for (const key of ["bytes", "sourceBytes", "preparedBytes"]) if (Number.isSafeInteger(details[key]) && details[key] >= 0) entry[key] = details[key];
  for (const key of ["mimeType", "sourceMimeType", "preparedMimeType"]) if (TYPES.has(details[key])) entry[key] = details[key];
  if (Number.isInteger(details.httpStatus) && details.httpStatus >= 100 && details.httpStatus <= 599) entry.httpStatus = details.httpStatus;
  if (details.errorCode) entry.errorCode = ERRORS.has(details.errorCode) ? details.errorCode : "unknown";
  if (typeof details.retryable === "boolean") entry.retryable = details.retryable;
  for (const key of ["format", "originalExtension"]) if (FORMATS.includes(details[key])) entry[key] = details[key];
  if (["image", "raw", "video"].includes(details.resourceType)) entry.resourceType = details.resourceType;
  if (["none", "jpeg", "failed"].includes(details.conversion)) entry.conversion = details.conversion;
  return entry;
}

// A bounded, strictly allowlisted session trace. Browser storage failures must not affect photographs.
export function createPhotoUploadTrace({ storage = null, onChange = () => {} } = {}) {
  let entries = [];
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? "[]");
    if (Array.isArray(saved)) entries = saved.slice(-250).map((e) => e && sanitize(e.photoId, e.stage, e, e.timestamp)).filter(Boolean);
  } catch { /* Storage unavailable or corrupt. */ }
  return {
    record(photoId, stage, details) {
      const entry = sanitize(photoId, stage, details);
      if (!entry) return;
      entries = [...entries.slice(-249), entry];
      try { storage?.setItem(KEY, JSON.stringify(entries)); } catch { /* Keep in memory. */ }
      try { onChange(); } catch { /* Observers cannot break uploads. */ }
    },
    read: () => entries.map((entry) => ({ ...entry })),
  };
}
let storage = null;
try { storage = globalThis.sessionStorage; } catch { /* Privacy mode. */ }
const trace = createPhotoUploadTrace({ storage, onChange: () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
} });
export const recordPhotoUploadTrace = (photoId, stage, details) => trace.record(photoId, stage, details);
export const readPhotoUploadTrace = () => trace.read();
export function subscribePhotoUploadTrace(listener) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
export function recordSyncedPhotoTraces(records) {
  const latest = new Map(trace.read().map((entry) => [entry.photoId, entry.stage]));
  for (const record of records) {
    if (record.sync?.status !== "metadata-synced") continue;
    for (const photo of record.photos ?? []) {
      if (photo.cloud?.state === "synced" && latest.has(photo.id) && latest.get(photo.id) !== "firestore_synced") trace.record(photo.id, "firestore_synced");
    }
  }
}
