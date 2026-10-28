import { distanceBetweenCoordinatesMeters } from "../../waters/data/nearbyWaterMatch.js";

export const CATCH_VERIFICATION_STATUS = Object.freeze({ VERIFIED: "verified", UNVERIFIED: "unverified" });
export const LIVE_GPS_MAX_AGE_MS = 2 * 60 * 1000;
export const LIVE_GPS_MAX_ACCURACY_METERS = 100;
export const VERIFIED_WATER_RADIUS_METERS = 300;
export const PHOTO_CAPTURE_TIME_TOLERANCE_MS = 6 * 60 * 60 * 1000;

export function isValidPhotoHash(value) {
  return typeof value === "string" && /^[a-f\d]{64}$/i.test(value);
}

export function isCatchProgressionEligible(record) {
  // Records predating this model are grandfathered to preserve previously earned XP.
  return !record?.verification || record.verification.status === CATCH_VERIFICATION_STATUS.VERIFIED;
}

export function getCatchPhotoHash(photo) {
  const hash = photo?.contentSha256 || photo?.cloud?.sha256;
  return isValidPhotoHash(hash) ? hash.toLowerCase() : null;
}

export function filterEligibleCatchRecords(catches = []) {
  const ordered = [...(Array.isArray(catches) ? catches : [])]
    .sort((a, b) => (Date.parse(a?.caughtAt) || 0) - (Date.parse(b?.caughtAt) || 0));
  const usedHashes = new Set(ordered.filter((record) => !record?.verification)
    .flatMap((record) => (record.photos ?? []).map(getCatchPhotoHash)).filter(Boolean));
  return ordered.filter((record) => {
    if (!isCatchProgressionEligible(record)) return false;
    if (!record?.verification) return true;
    const hash = record.verification.photoHash?.toLowerCase();
    if (!isValidPhotoHash(hash) || !(record.photos ?? []).some((photo) => getCatchPhotoHash(photo) === hash) || usedHashes.has(hash)) return false;
    usedHashes.add(hash);
    return true;
  });
}

function validCoordinates(value) {
  return value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && value.latitude >= -90 && value.latitude <= 90 && value.longitude >= -180 && value.longitude <= 180;
}

export function normalizePhotoCaptureMetadata(value) {
  const capturedAt = typeof value?.capturedAt === "string" && Number.isFinite(Date.parse(value.capturedAt)) ? value.capturedAt : null;
  const coordinates = validCoordinates(value?.coordinates) ? {
    latitude: value.coordinates.latitude,
    longitude: value.coordinates.longitude,
  } : null;
  return capturedAt || coordinates ? { capturedAt, coordinates } : null;
}

export function normalizeLocationEvidence(value) {
  if (value?.source !== "live-gps" || !Number.isFinite(Date.parse(value.capturedAt)) || !validCoordinates(value.coordinates)) return null;
  if (!Number.isFinite(value.accuracyMeters) || value.accuracyMeters <= 0) return null;
  return {
    source: "live-gps",
    capturedAt: value.capturedAt,
    accuracyMeters: value.accuracyMeters,
    coordinates: { latitude: value.coordinates.latitude, longitude: value.coordinates.longitude },
  };
}

export function normalizeCatchVerification(value) {
  if (!value || typeof value !== "object") return null;
  const photoHash = isValidPhotoHash(value.photoHash) ? value.photoHash.toLowerCase() : null;
  const locationSource = ["live-gps", "photo-exif"].includes(value.locationSource) ? value.locationSource : null;
  const verifiedAt = typeof value.verifiedAt === "string" && Number.isFinite(Date.parse(value.verifiedAt)) ? value.verifiedAt : null;
  const verified = value.status === CATCH_VERIFICATION_STATUS.VERIFIED && photoHash && locationSource && verifiedAt;
  return {
    status: verified ? CATCH_VERIFICATION_STATUS.VERIFIED : CATCH_VERIFICATION_STATUS.UNVERIFIED,
    reason: typeof value.reason === "string" ? value.reason.slice(0, 80) : "evidence-incomplete",
    photoHash,
    photoCaptureMetadata: normalizePhotoCaptureMetadata(value.photoCaptureMetadata),
    locationSource: verified ? locationSource : null,
    gpsAccuracyMeters: verified && Number.isFinite(value.gpsAccuracyMeters) ? value.gpsAccuracyMeters : null,
    verifiedAt: verified ? verifiedAt : null,
  };
}

function liveGpsProof(locationEvidence, nowMs) {
  if (locationEvidence?.source !== "live-gps" || !validCoordinates(locationEvidence.coordinates)) return null;
  const timestampMs = Date.parse(locationEvidence.capturedAt);
  const accuracyMeters = Number(locationEvidence.accuracyMeters);
  const ageMs = nowMs - timestampMs;
  if (!Number.isFinite(timestampMs) || ageMs < -10_000 || ageMs > LIVE_GPS_MAX_AGE_MS) return null;
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0 || accuracyMeters > LIVE_GPS_MAX_ACCURACY_METERS) return null;
  return { source: "live-gps", coordinates: locationEvidence.coordinates, accuracyMeters };
}

function photoExifProof(photo, fallbackMetadata, caughtAtMs, water) {
  const metadata = photo?.captureMetadata ?? fallbackMetadata;
  if (!validCoordinates(metadata?.coordinates) || !Number.isFinite(Date.parse(metadata?.capturedAt))) return null;
  if (Math.abs(Date.parse(metadata.capturedAt) - caughtAtMs) > PHOTO_CAPTURE_TIME_TOLERANCE_MS) return null;
  const distance = distanceBetweenCoordinatesMeters(metadata.coordinates, water?.coordinates);
  if (distance === null || distance > VERIFIED_WATER_RADIUS_METERS) return null;
  return { source: "photo-exif", coordinates: metadata.coordinates, accuracyMeters: null };
}

export function evaluateCatchVerification({
  photos = [], locationEvidence = null, tripId = null, activeTripId = null, water = null,
  caughtAt, now = new Date(), usedPhotoHashes = new Set(), previousPhotoEvidence = null,
} = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();
  const timestamp = Number.isFinite(nowMs) ? nowDate.toISOString() : new Date().toISOString();
  const photo = photos.find((item) => item?.blob instanceof Blob && String(item.type || item.blob.type).startsWith("image/"));
  if (!photo) return { status: CATCH_VERIFICATION_STATUS.UNVERIFIED, reason: "missing-photo", photoHash: null, photoCaptureMetadata: null, locationSource: null, gpsAccuracyMeters: null, verifiedAt: null };
  const photoHash = getCatchPhotoHash(photo);
  const photoCaptureMetadata = photo.captureMetadata ?? (previousPhotoEvidence?.photoHash === photoHash ? previousPhotoEvidence.photoCaptureMetadata : null);
  if (!photoHash) return { status: CATCH_VERIFICATION_STATUS.UNVERIFIED, reason: "invalid-photo-hash", photoHash: null, photoCaptureMetadata, locationSource: null, gpsAccuracyMeters: null, verifiedAt: null };
  if (usedPhotoHashes.has(photoHash)) return { status: CATCH_VERIFICATION_STATUS.UNVERIFIED, reason: "photo-already-used", photoHash, photoCaptureMetadata, locationSource: null, gpsAccuracyMeters: null, verifiedAt: null };

  const caughtAtMs = Date.parse(caughtAt);
  const exif = Number.isFinite(caughtAtMs) ? photoExifProof(photo, photoCaptureMetadata, caughtAtMs, water) : null;
  const live = liveGpsProof(locationEvidence, nowMs);
  let proof = exif;
  if (!proof && live) {
    const gpsAtSelectedWater = distanceBetweenCoordinatesMeters(live.coordinates, water?.coordinates) !== null
      && distanceBetweenCoordinatesMeters(live.coordinates, water.coordinates) <= VERIFIED_WATER_RADIUS_METERS;
    if ((tripId && activeTripId && tripId === activeTripId) || gpsAtSelectedWater) proof = live;
  }
  if (!proof) {
    const reason = locationEvidence?.source === "live-gps" && !live
      ? "stale-or-inaccurate-gps"
      : "missing-trip-or-water-location";
    return { status: CATCH_VERIFICATION_STATUS.UNVERIFIED, reason, photoHash, photoCaptureMetadata, locationSource: null, gpsAccuracyMeters: null, verifiedAt: null };
  }
  return {
    status: CATCH_VERIFICATION_STATUS.VERIFIED,
    reason: proof.source === "photo-exif" ? "photo-date-and-location" : tripId === activeTripId ? "live-gps-active-trip" : "live-gps-at-water",
    photoHash,
    photoCaptureMetadata,
    locationSource: proof.source,
    gpsAccuracyMeters: proof.accuracyMeters,
    verifiedAt: timestamp,
  };
}
