import { PRODUCT_LIMITS } from "../product/config/limits.js";
import { XP_RULES } from "../product/config/xp.js";

const SHA256_PATTERN = /^[a-f\d]{64}$/i;
const XP = Object.freeze({
  base: XP_RULES.catch.base,
  photo: XP_RULES.catch.photo,
  context: XP_RULES.catch.gpsAndWeather,
  limitedMultiplier: XP_RULES.catchVerificationMultiplier.limited,
  dailyLimitedCap: XP_RULES.limitedCatch.dailyCap,
});

function dateMs(value) {
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function coordinates(value) {
  return value && Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90
    && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}

function distanceMeters(a, b) {
  if (!coordinates(a) || !coordinates(b)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const lat = radians(b.latitude - a.latitude);
  const lng = radians(b.longitude - a.longitude);
  const value = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function getServerSyncedPhotoHashes(record, ownerId) {
  const hashes = [];
  for (const photo of Array.isArray(record?.photos) ? record.photos : []) {
    const cloud = photo?.cloud;
    const expectedKey = `users/${ownerId}/catches/${record.id}/photos/${photo?.id}/original`;
    if (cloud?.state === "synced" && cloud.provider === "cloudinary" && cloud.objectKey === expectedKey
      && typeof cloud.sha256 === "string" && SHA256_PATTERN.test(cloud.sha256)) hashes.push(cloud.sha256.toLowerCase());
  }
  return [...new Set(hashes)];
}

export function getServerSyncedPhotoHash(record, ownerId) {
  return getServerSyncedPhotoHashes(record, ownerId)[0] ?? null;
}

function contextEligible(record) {
  const source = record?.gpsSource;
  const hasTrustedCoordinates = ["live-gps", "photo-exif"].includes(source) && coordinates(record.coordinates);
  const conditions = record?.conditions;
  const hasWeather = [conditions?.airTempC, conditions?.airTemperatureC, conditions?.waterTempC,
    conditions?.waterTemperatureC, conditions?.pressureHpa, conditions?.windKmh, conditions?.weather]
    .some((value) => value !== null && value !== undefined && value !== "");
  return hasTrustedCoordinates && hasWeather;
}

function matchesTrip(record, trip, caughtAt) {
  if (!trip || trip.deleted || trip.ownerId !== record.ownerId || trip.id !== record.tripId) return false;
  const start = dateMs(trip.startedAt);
  const end = trip.endedAt == null ? null : dateMs(trip.endedAt);
  return start !== null && caughtAt >= start - PRODUCT_LIMITS.tripCatchTimeToleranceMs
    && (end === null || caughtAt <= end + PRODUCT_LIMITS.tripCatchTimeToleranceMs);
}

function evidenceLevel(record, { trip, water, caughtAt, now }) {
  const proof = record.verification?.photoCaptureMetadata;
  const capturedAt = dateMs(proof?.capturedAt);
  const photoDateMatches = capturedAt !== null && capturedAt <= now
    && Math.abs(capturedAt - caughtAt) <= PRODUCT_LIMITS.photoCaptureTimeToleranceMs;
  const waterCoordinates = water?.ownerId === record.ownerId && !water.deleted ? water.coordinates : null;
  const photoGpsMatches = coordinates(proof?.coordinates) && coordinates(waterCoordinates)
    && distanceMeters(proof.coordinates, waterCoordinates) <= PRODUCT_LIMITS.verifiedWaterRadiusMeters;

  const live = record.locationEvidence;
  const liveAt = dateMs(live?.capturedAt);
  const liveFixValid = live?.source === "live-gps" && liveAt !== null
    && now - liveAt >= 0 && now - liveAt <= PRODUCT_LIMITS.liveGpsMaxAgeMs
    && Math.abs(liveAt - caughtAt) <= PRODUCT_LIMITS.liveGpsMaxAgeMs
    && Number.isFinite(live.accuracyMeters) && live.accuracyMeters > 0
    && live.accuracyMeters <= PRODUCT_LIMITS.liveGpsMaxAccuracyMeters && coordinates(live.coordinates);
  const liveGpsMatches = liveFixValid && coordinates(waterCoordinates)
    && distanceMeters(live.coordinates, waterCoordinates) <= PRODUCT_LIMITS.verifiedWaterRadiusMeters;
  if (liveGpsMatches || (photoDateMatches && photoGpsMatches)) return "strong";

  const tripMatches = matchesTrip(record, trip, caughtAt);
  const gpsMatchesCatch = liveFixValid && record.gpsSource === "live-gps" && coordinates(record.coordinates)
    && distanceMeters(live.coordinates, record.coordinates) <= PRODUCT_LIMITS.liveGpsMaxAccuracyMeters;
  if (photoDateMatches || (coordinates(proof?.coordinates) && photoGpsMatches) || tripMatches || gpsMatchesCatch) return "standard";
  return "limited";
}

/** Calculate a conservative shadow reward from the server's stored Catch, never request-supplied XP. */
export function calculateServerCatchReward({
  catchRecord, ownerId, trip = null, water = null, duplicatePhoto = false,
  duplicatePhotoHashes = new Set(), photoHashes = null,
  currentXp = 0, dailyLimitedXp = 0, limitedAlreadyClaimed = false, now = Date.now(),
}) {
  if (!catchRecord || catchRecord.ownerId !== ownerId || catchRecord.deleted) {
    return { eligible: false, level: "unverified", reason: "catch-unavailable", photoHash: null, targetXp: 0, deltaXp: 0, events: [] };
  }
  const caughtAt = dateMs(catchRecord.caughtAt);
  const candidateHashes = Array.isArray(photoHashes) ? photoHashes : getServerSyncedPhotoHashes(catchRecord, ownerId);
  const usedHashes = duplicatePhotoHashes instanceof Set ? duplicatePhotoHashes : new Set(duplicatePhotoHashes);
  const photoHash = candidateHashes.find((hash) => !usedHashes.has(hash)) ?? null;
  if (caughtAt === null || caughtAt > now + PRODUCT_LIMITS.futureCatchClockSkewMs) {
    return { eligible: false, level: "unverified", reason: caughtAt === null ? "invalid-catch-date" : "future-catch", photoHash, targetXp: currentXp, deltaXp: 0, events: [] };
  }
  if (!photoHash || duplicatePhoto || candidateHashes.length > 0 && candidateHashes.every((hash) => usedHashes.has(hash))) {
    return { eligible: false, level: "unverified", reason: duplicatePhoto || candidateHashes.length > 0 ? "duplicate-photo" : "photo-not-server-available", photoHash: null, targetXp: currentXp, deltaXp: 0, events: [] };
  }

  const level = evidenceLevel(catchRecord, { trip, water, caughtAt, now });
  const normalTarget = contextEligible(catchRecord) ? XP.context : XP.photo;
  if (level === "limited") {
    const targetXp = Math.round(normalTarget * XP.limitedMultiplier);
    const dailyRemaining = Math.max(0, XP.dailyLimitedCap - dailyLimitedXp);
    const deltaXp = limitedAlreadyClaimed ? 0 : Math.min(Math.max(0, targetXp - currentXp), dailyRemaining);
    return {
      eligible: true, level, reason: "photo-without-matching-time-or-place", photoHash,
      targetXp: currentXp + deltaXp, deltaXp,
      events: limitedAlreadyClaimed ? [] : [{ type: "catch.limited", xp: deltaXp }],
    };
  }

  let earned = currentXp;
  const events = [];
  const addToward = (type, target) => {
    const deltaXp = Math.max(0, target - earned);
    if (deltaXp > 0) events.push({ type, xp: deltaXp });
    earned += deltaXp;
  };
  addToward("catch.created", XP.base);
  addToward("catch.photo", XP.photo);
  if (normalTarget >= XP.context) addToward("catch.context", XP.context);
  return { eligible: true, level, reason: "supported-photo-evidence", photoHash, targetXp: earned, deltaXp: earned - currentXp, events };
}

export const SERVER_REWARD_XP = XP;
