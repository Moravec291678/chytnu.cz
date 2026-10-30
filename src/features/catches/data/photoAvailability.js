import { isPhotoCloudReady } from "./photoCloudProvider.js";

const PENDING_STATES = new Set(["localOnly", "pendingUpload", "uploadFailed", "pendingDelete"]);

export const PHOTO_AVAILABILITY = Object.freeze({
  AVAILABLE: "available",
  PENDING: "pending",
  SYNCING: "syncing",
  RETRYABLE_ERROR: "retryable-error",
  BROKEN: "broken",
});

export const PHOTO_SYNC_HELP = "U většího počtu fotografií může synchronizace trvat déle. Aplikaci můžeš dál používat.";

export function getPhotoAvailability(photo, { loadState = "idle", errorCode = "" } = {}) {
  const cloudState = photo?.cloud?.state ?? "localOnly";
  const hasSyncedCloudCopy = isPhotoCloudReady(photo);
  const unreadableWithoutCloud = photo?.localError?.code === "photo_local_blob_unreadable" && !hasSyncedCloudCopy;

  if (unreadableWithoutCloud || photo?.uploadReady === false || (!photo?.blob && cloudState === "unavailable")
    || errorCode === "cloudinary_asset_missing") return PHOTO_AVAILABILITY.BROKEN;
  if (loadState === "loading") return PHOTO_AVAILABILITY.SYNCING;
  if (loadState === "error") return PHOTO_AVAILABILITY.RETRYABLE_ERROR;
  if (photo?.blob instanceof Blob && photo?.localError?.code !== "photo_local_blob_unreadable") return PHOTO_AVAILABILITY.AVAILABLE;
  if (hasSyncedCloudCopy) return PHOTO_AVAILABILITY.SYNCING;
  if (PENDING_STATES.has(cloudState)) return PHOTO_AVAILABILITY.PENDING;
  return PHOTO_AVAILABILITY.PENDING;
}
