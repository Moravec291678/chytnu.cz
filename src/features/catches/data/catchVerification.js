import { distanceBetweenCoordinatesMeters } from "../../waters/data/nearbyWaterMatch.js";

export const CATCH_VERIFICATION_STATUS = Object.freeze({ VERIFIED: "verified", UNVERIFIED: "unverified" });
export const CATCH_VERIFICATION_LEVEL = Object.freeze({
  STRONG: "strong",
  STANDARD: "standard",
  LIMITED: "limited",
  UNVERIFIED: "unverified",
});
const CATCH_VERIFICATION_LEVELS = new Set(Object.values(CATCH_VERIFICATION_LEVEL));
export const LIVE_GPS_MAX_AGE_MS = 15 * 60 * 1000;
export const LIVE_GPS_MAX_ACCURACY_METERS = 150;
export const VERIFIED_WATER_RADIUS_METERS = 1000;
export const PHOTO_CAPTURE_TIME_TOLERANCE_MS = 24 * 60 * 60 * 1000;
export const TRIP_CATCH_TIME_TOLERANCE_MS = 30 * 60 * 1000;
export const FUTURE_CATCH_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function isCatchDateEligibleForProgression(record, now = new Date()) {
  const caughtAtMs = Date.parse(record?.caughtAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(caughtAtMs) || !Number.isFinite(nowMs)) return true;
  return caughtAtMs <= nowMs + FUTURE_CATCH_CLOCK_SKEW_MS;
}

export function isValidPhotoHash(value) {
  return typeof value === "string" && /^[a-f\d]{64}$/i.test(value);
}

export function isCatchProgressionEligible(record, now = new Date()) {
  // Records predating this model are grandfathered to preserve previously earned XP.
  return isCatchDateEligibleForProgression(record, now)
    && (!record?.verification || record.verification.status === CATCH_VERIFICATION_STATUS.VERIFIED);
}

export function getCatchPhotoHash(photo) {
  const hash = photo?.contentSha256 || photo?.cloud?.sha256;
  return isValidPhotoHash(hash) ? hash.toLowerCase() : null;
}

export function filterEligibleCatchRecords(catches = [], { now = new Date() } = {}) {
  const ordered = [...(Array.isArray(catches) ? catches : [])]
    .sort((a, b) => (Date.parse(a?.caughtAt) || 0) - (Date.parse(b?.caughtAt) || 0));
  const usedHashes = new Set(ordered.filter((record) => !record?.verification && isCatchDateEligibleForProgression(record, now))
    .flatMap((record) => (record.photos ?? []).map(getCatchPhotoHash)).filter(Boolean));
  return ordered.filter((record) => {
    if (!isCatchProgressionEligible(record, now)) return false;
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
  const locationSource = ["live-gps", "photo-exif", "trip"].includes(value.locationSource) ? value.locationSource : null;
  const verifiedAt = typeof value.verifiedAt === "string" && Number.isFinite(Date.parse(value.verifiedAt)) ? value.verifiedAt : null;
  const hasVerifiedEvidence = Boolean(photoHash && locationSource && verifiedAt);
  const verified = value.status === CATCH_VERIFICATION_STATUS.VERIFIED && hasVerifiedEvidence;
  const requestedLevel = CATCH_VERIFICATION_LEVELS.has(value.level) ? value.level : null;
  // Old verified records predate the level field. Treat them as standard so
  // adding this model never downgrades their status or progression eligibility.
  const level = verified
    ? requestedLevel === CATCH_VERIFICATION_LEVEL.STRONG || requestedLevel === CATCH_VERIFICATION_LEVEL.STANDARD
      ? requestedLevel
      : CATCH_VERIFICATION_LEVEL.STANDARD
    : value.status !== CATCH_VERIFICATION_STATUS.VERIFIED && requestedLevel === CATCH_VERIFICATION_LEVEL.LIMITED
      ? CATCH_VERIFICATION_LEVEL.LIMITED
      : CATCH_VERIFICATION_LEVEL.UNVERIFIED;
  const preserveLimitedEvidence = level === CATCH_VERIFICATION_LEVEL.LIMITED;
  return {
    status: verified ? CATCH_VERIFICATION_STATUS.VERIFIED : CATCH_VERIFICATION_STATUS.UNVERIFIED,
    level,
    reason: typeof value.reason === "string" ? value.reason.slice(0, 80) : "evidence-incomplete",
    photoHash,
    photoCaptureMetadata: normalizePhotoCaptureMetadata(value.photoCaptureMetadata),
    locationSource: verified || preserveLimitedEvidence ? locationSource : null,
    gpsAccuracyMeters: (verified || preserveLimitedEvidence) && Number.isFinite(value.gpsAccuracyMeters) ? value.gpsAccuracyMeters : null,
    verifiedAt: verified ? verifiedAt : null,
  };
}

function locationTarget({ water, coordinates, gpsSource }) {
  if (validCoordinates(water?.coordinates)) return water.coordinates;
  if (["live-gps", "manual-map"].includes(gpsSource) && validCoordinates(coordinates)) return coordinates;
  return null;
}

function isNearTarget(point, target) {
  if (!validCoordinates(target)) return false;
  const distance = distanceBetweenCoordinatesMeters(point, target);
  return distance !== null && distance <= VERIFIED_WATER_RADIUS_METERS;
}

function liveGpsProof(locationEvidence, nowMs, target) {
  if (locationEvidence?.source !== "live-gps" || !validCoordinates(locationEvidence.coordinates)) return null;
  const timestampMs = Date.parse(locationEvidence.capturedAt);
  const accuracyMeters = Number(locationEvidence.accuracyMeters);
  const ageMs = nowMs - timestampMs;
  if (!Number.isFinite(timestampMs) || ageMs < -10_000 || ageMs > LIVE_GPS_MAX_AGE_MS) return null;
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0 || accuracyMeters > LIVE_GPS_MAX_ACCURACY_METERS) return null;
  return {
    source: "live-gps", coordinates: locationEvidence.coordinates, accuracyMeters,
    nearTarget: isNearTarget(locationEvidence.coordinates, target),
  };
}

function photoExifEvidence(photo, fallbackMetadata, caughtAtMs, target, nowMs) {
  const metadata = photo?.captureMetadata ?? fallbackMetadata;
  const captureTimeMs = Date.parse(metadata?.capturedAt);
  const hasCaptureTime = Number.isFinite(captureTimeMs);
  const hasCoordinates = validCoordinates(metadata?.coordinates);
  const timeMatches = hasCaptureTime && captureTimeMs <= nowMs && Number.isFinite(caughtAtMs)
    && Math.abs(captureTimeMs - caughtAtMs) <= PHOTO_CAPTURE_TIME_TOLERANCE_MS;
  const hasTarget = validCoordinates(target);
  const gpsMatches = hasCoordinates && (!hasTarget || isNearTarget(metadata.coordinates, target));
  const gpsConflicts = hasCoordinates && hasTarget && !gpsMatches;
  return {
    metadata,
    timeMatches: timeMatches && !gpsConflicts,
    gpsMatches,
    combined: timeMatches && gpsMatches,
  };
}

function matchingTrip({ tripId, trips, caughtAtMs, nowMs }) {
  if (!tripId || !Array.isArray(trips)) return null;
  const trip = trips.find((item) => item?.id === tripId);
  if (!trip) return null;
  const startMs = Date.parse(trip.startedAt);
  const endMs = trip.endedAt ? Date.parse(trip.endedAt) : nowMs;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs || !Number.isFinite(caughtAtMs)) return null;
  const withinTrip = caughtAtMs >= startMs - TRIP_CATCH_TIME_TOLERANCE_MS
    && caughtAtMs <= endMs + TRIP_CATCH_TIME_TOLERANCE_MS
    && caughtAtMs <= nowMs + 5 * 60 * 1000;
  return withinTrip ? trip : null;
}

export function evaluateCatchVerification({
  photos = [], locationEvidence = null, tripId = null, activeTripId = null, trips = [],
  coordinates = null, gpsSource = "default", water = null,
  caughtAt, now = new Date(), usedPhotoHashes = new Set(), previousPhotoEvidence = null,
} = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();
  const timestamp = Number.isFinite(nowMs) ? nowDate.toISOString() : new Date().toISOString();
  const imagePhotos = photos.filter((item) => item?.blob instanceof Blob && String(item.type || item.blob.type).startsWith("image/"));
  if (!imagePhotos.length) return { status: CATCH_VERIFICATION_STATUS.UNVERIFIED, level: CATCH_VERIFICATION_LEVEL.UNVERIFIED, reason: "missing-photo", photoHash: null, photoCaptureMetadata: null, locationSource: null, gpsAccuracyMeters: null, verifiedAt: null };
  const photoCandidates = imagePhotos.map((item) => ({ photo: item, hash: getCatchPhotoHash(item) }));
  const uniqueCandidate = photoCandidates.find(({ hash }) => hash && !usedPhotoHashes.has(hash));
  const existingHashCandidate = photoCandidates.find(({ hash }) => hash);
  const selectedCandidate = uniqueCandidate ?? existingHashCandidate ?? photoCandidates[0];
  const photo = selectedCandidate.photo;
  const photoHash = selectedCandidate.hash;
  const photoCaptureMetadata = photo.captureMetadata ?? (previousPhotoEvidence?.photoHash === photoHash ? previousPhotoEvidence.photoCaptureMetadata : null);
  if (!uniqueCandidate) {
    const hasValidHash = Boolean(existingHashCandidate);
    return {
      status: CATCH_VERIFICATION_STATUS.UNVERIFIED,
      level: CATCH_VERIFICATION_LEVEL.UNVERIFIED,
      reason: hasValidHash ? "photo-already-used" : "invalid-photo-hash",
      photoHash: hasValidHash ? photoHash : null,
      photoCaptureMetadata,
      locationSource: null,
      gpsAccuracyMeters: null,
      verifiedAt: null,
    };
  }

  const caughtAtMs = Date.parse(caughtAt);
  const target = locationTarget({ water, coordinates, gpsSource });
  const exif = photoExifEvidence(photo, photoCaptureMetadata, caughtAtMs, target, nowMs);
  const live = liveGpsProof(locationEvidence, nowMs, target);
  const trip = matchingTrip({ tripId, trips, caughtAtMs, nowMs });
  // Current device GPS cannot strengthen a Catch linked to a completed trip:
  // it describes where the user is now, not where the historical Catch happened.
  const liveCatchEvidence = trip?.endedAt ? null : live;

  let level = null;
  let source = null;
  let reason = null;
  if (liveCatchEvidence?.nearTarget) {
    level = CATCH_VERIFICATION_LEVEL.STRONG;
    source = "live-gps";
    reason = trip && trip.id === activeTripId && !trip.endedAt ? "live-gps-active-trip" : "live-gps-at-water";
  } else if (exif.combined) {
    level = CATCH_VERIFICATION_LEVEL.STRONG;
    source = "photo-exif";
    reason = "photo-date-and-location";
  } else if (trip) {
    level = CATCH_VERIFICATION_LEVEL.STANDARD;
    source = "trip";
    reason = "trip-time-match";
  } else if (exif.timeMatches) {
    level = CATCH_VERIFICATION_LEVEL.STANDARD;
    source = "photo-exif";
    reason = "photo-capture-time";
  } else if (exif.gpsMatches) {
    level = CATCH_VERIFICATION_LEVEL.STANDARD;
    source = "photo-exif";
    reason = "photo-gps-location";
  } else if (liveCatchEvidence && (liveCatchEvidence.nearTarget || !target)) {
    level = CATCH_VERIFICATION_LEVEL.STANDARD;
    source = "live-gps";
    reason = "live-gps-capture";
  }

  if (!level) {
    const reason = locationEvidence?.source === "live-gps" && !live
      ? "stale-or-inaccurate-gps"
      : liveCatchEvidence && validCoordinates(target) && !liveCatchEvidence.nearTarget
        ? "live-gps-location-mismatch"
      : exif.metadata?.coordinates && validCoordinates(target) && !exif.gpsMatches
        ? "exif-location-mismatch"
        : "missing-trip-or-water-location";
    const inconsistent = reason === "exif-location-mismatch" || reason === "live-gps-location-mismatch";
    return {
      status: CATCH_VERIFICATION_STATUS.UNVERIFIED,
      level: inconsistent ? CATCH_VERIFICATION_LEVEL.UNVERIFIED : CATCH_VERIFICATION_LEVEL.LIMITED,
      reason,
      photoHash,
      photoCaptureMetadata,
      locationSource: null,
      gpsAccuracyMeters: null,
      verifiedAt: null,
    };
  }
  return {
    status: CATCH_VERIFICATION_STATUS.VERIFIED,
    level,
    reason,
    photoHash,
    photoCaptureMetadata,
    locationSource: source,
    gpsAccuracyMeters: source === "live-gps" ? live.accuracyMeters : null,
    verifiedAt: timestamp,
  };
}
