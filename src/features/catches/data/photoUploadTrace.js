const KEY = "chytnu:photo-upload-trace:v1";
const EVENT = "chytnu:photo-upload-trace-changed";
const STAGES = new Set(["photo_selected", "photo_preparing", "blob_created", "photo_prepared", "indexeddb_saved", "job_created", "photo_queued", "sign_started", "sign_pass", "sign_fail", "cloud_upload_started", "cloud_upload_response", "cloud_upload_pass", "cloud_upload_fail", "photo_uploaded", "verify_started", "verify_pass", "verify_fail", "photo_verifying", "photo_persisting", "local_metadata_persisted", "photo_synced", "firestore_synced", "photo_delivery_started", "photo_delivery_pass", "photo_delivery_fail", "photo_image_rendered", "photo_image_decode_fail", "local_blob_failure", "upload_fail"]);
const ERRORS = new Set(["missing_firebase_user", "invalid_auth", "firebase_token_invalid", "firebase_token_expired", "token_refresh_failed", "ownership_denied", "cloudinary_upload_failed", "cloudinary_upload_timeout", "cloudinary_network_error", "cloudinary_verification_failed", "cloudinary_download_failed", "photo_not_available", "photo_not_owned", "provider_download_failed", "invalid_photo", "photo_prepare_failed", "photo_unsupported", "photo_too_large", "photo_local_blob_unreadable", "photo_local_blob_readback_failed", "photo_local_blob_hash_mismatch", "rate_limited", "invalid_grant", "upload_response_mismatch"]);
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "image/avif", "application/octet-stream"]);
const FORMATS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "avif", "unknown"];
const OPERATION_STAGES = new Set(["photo-cache-write-source", "photo-diagnostics-read-local-blob", "photo-hash-local-blob", "photo-prepare-source-read", "photo-read-local-blob", "photo-readback-local-blob", "photo-store-write-source", "photo-verify-local-blob", "photo-verify-source-bytes", "photo-upload"]);
const TIMED_STAGES = [
  ["photo_selected", ["photo_prepared"]], ["photo_prepared", ["indexeddb_saved"]],
  ["sign_started", ["sign_pass", "sign_fail"]], ["cloud_upload_started", ["cloud_upload_pass", "cloud_upload_fail"]],
  ["verify_started", ["verify_pass", "verify_fail"]], ["photo_persisting", ["local_metadata_persisted"]],
  ["local_metadata_persisted", ["firestore_synced"]], ["photo_delivery_started", ["photo_delivery_pass", "photo_delivery_fail"]],
  ["photo_delivery_pass", ["photo_image_rendered", "photo_image_decode_fail"]],
];
function sanitize(photoId, stage, details = {}, timestamp = Date.now()) {
  if (typeof photoId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(photoId) || !STAGES.has(stage)) return null;
  const entry = { photoId, stage, timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() };
  if (typeof details.catchId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(details.catchId)) entry.catchId = details.catchId;
  for (const key of ["bytes", "sourceBytes", "preparedBytes"]) if (Number.isSafeInteger(details[key]) && details[key] >= 0) entry[key] = details[key];
  if (Number.isFinite(details.durationMs) && details.durationMs >= 0) entry.durationMs = Math.round(details.durationMs);
  for (const key of ["mimeType", "sourceMimeType", "preparedMimeType"]) if (TYPES.has(details[key])) entry[key] = details[key];
  if (Number.isInteger(details.httpStatus) && details.httpStatus >= 100 && details.httpStatus <= 599) entry.httpStatus = details.httpStatus;
  if (Number.isInteger(details.providerStatus) && details.providerStatus >= 100 && details.providerStatus <= 599) entry.providerStatus = details.providerStatus;
  if (details.errorCode) entry.errorCode = ERRORS.has(details.errorCode) ? details.errorCode : "unknown";
  if (typeof details.retryable === "boolean") entry.retryable = details.retryable;
  if (["NotFoundError", "DataError", "TypeError", "InvalidStateError", "AbortError", "SecurityError"].includes(details.errorName)) entry.errorName = details.errorName;
  if (OPERATION_STAGES.has(details.operationStage)) entry.operationStage = details.operationStage;
  for (const key of ["format", "originalExtension"]) if (FORMATS.includes(details[key])) entry[key] = details[key];
  if (["image", "raw", "video"].includes(details.resourceType)) entry.resourceType = details.resourceType;
  if (["none", "jpeg", "failed"].includes(details.conversion)) entry.conversion = details.conversion;
  return entry;
}

// A bounded, strictly allowlisted session trace. Browser storage failures must not affect photographs.
export function createPhotoUploadTrace({ storage = null, onChange = () => {}, now = Date.now } = {}) {
  let entries = [];
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? "[]");
    if (Array.isArray(saved)) entries = saved.slice(-250).map((e) => e && sanitize(e.photoId, e.stage, e, e.timestamp)).filter(Boolean);
  } catch { /* Storage unavailable or corrupt. */ }
  return {
    record(photoId, stage, details) {
      const entry = sanitize(photoId, stage, details, now());
      if (!entry) return;
      const timing = TIMED_STAGES.find(([, ends]) => ends.includes(stage));
      if (entry.durationMs === undefined && timing) {
        const [start, ends] = timing;
        // A missing start (or a repeated completion) is unknown, never zero or the duration of an older attempt.
        const previous = entries.findLast((event) => event.photoId === photoId && (!event.catchId || !entry.catchId || event.catchId === entry.catchId)
          && (event.stage === start || ends.includes(event.stage)));
        if (previous?.stage === start && previous.timestamp <= entry.timestamp) entry.durationMs = entry.timestamp - previous.timestamp;
      }
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
export function pendingPhotoAcknowledgments(entries = trace.read()) {
  const pending = new Set();
  for (const event of entries) {
    if (event.stage === "local_metadata_persisted" || event.stage === "photo_synced") pending.add(event.photoId);
    if (event.stage === "firestore_synced") pending.delete(event.photoId);
  }
  return pending;
}
export function recordSyncedPhotoTraces(records, pending = pendingPhotoAcknowledgments()) {
  for (const record of records) {
    if (record.sync?.status !== "metadata-synced") continue;
    for (const photo of record.photos ?? []) {
      if (photo.cloud?.state === "synced" && pending.has(photo.id)) trace.record(photo.id, "firestore_synced");
    }
  }
}
