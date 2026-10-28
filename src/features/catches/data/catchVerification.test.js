import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCatchVerification, filterEligibleCatchRecords, getCatchPhotoHash, isCatchDateEligibleForProgression, isCatchProgressionEligible,
  normalizeCatchVerification,
} from "./catchVerification.js";

const hashA = "a".repeat(64);
const now = new Date("2026-10-28T12:00:00.000Z");
const water = { id: "water-1", coordinates: { latitude: 50, longitude: 14 } };
const photo = (hash = hashA, captureMetadata = null) => ({
  id: `photo-${hash[0]}`, type: "image/jpeg", blob: new Blob([`photo-${hash}`], { type: "image/jpeg" }),
  contentSha256: hash, captureMetadata,
});

test("Catch without a real photo or a valid photo digest remains unverified", () => {
  assert.equal(evaluateCatchVerification({ photos: [], now }).reason, "missing-photo");
  assert.equal(evaluateCatchVerification({ photos: [{ type: "image/jpeg", blob: new Blob(["photo"]) }], now }).reason, "invalid-photo-hash");
});

test("a current accurate app GPS fix near the selected water plus active trip verifies strongly", () => {
  const verification = evaluateCatchVerification({
    photos: [photo()],
    tripId: "trip-live",
    activeTripId: "trip-live",
    trips: [{ id: "trip-live", startedAt: "2026-10-28T11:00:00.000Z", endedAt: null }],
    water,
    locationEvidence: {
      source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 18,
      coordinates: water.coordinates,
    },
    caughtAt: now.toISOString(), now,
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "strong");
  assert.equal(verification.reason, "live-gps-active-trip");
  assert.equal(verification.locationSource, "live-gps");
  assert.equal(verification.gpsAccuracyMeters, 18);
  assert.equal(verification.photoHash, hashA);
  assert.equal(verification.verifiedAt, now.toISOString());
});

test("old or inaccurate GPS and GPS without a trip or nearby saved water cannot verify", () => {
  const base = { photos: [photo()], caughtAt: now.toISOString(), now, tripId: null, activeTripId: null, water };
  const old = evaluateCatchVerification({ ...base, locationEvidence: {
    source: "live-gps", capturedAt: "2026-10-28T11:40:00.000Z", accuracyMeters: 12, coordinates: water.coordinates,
  } });
  assert.equal(old.status, "unverified");
  assert.equal(old.level, "limited");
  assert.equal(old.reason, "stale-or-inaccurate-gps");
  const inaccurate = evaluateCatchVerification({ ...base, locationEvidence: {
    source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 180, coordinates: water.coordinates,
  } });
  assert.equal(inaccurate.status, "unverified");
  const noLocationBinding = evaluateCatchVerification({ ...base, locationEvidence: {
    source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 12,
    coordinates: { latitude: 49, longitude: 13 },
  } });
  assert.equal(noLocationBinding.reason, "live-gps-location-mismatch");
  assert.equal(noLocationBinding.level, "unverified");
  const conflictingCurrentGps = evaluateCatchVerification({ ...base, locationEvidence: {
    source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 12,
    coordinates: { latitude: 49, longitude: 13 },
  } });
  assert.equal(conflictingCurrentGps.reason, "live-gps-location-mismatch");
  assert.equal(conflictingCurrentGps.level, "unverified");
});

test("a real unique photo without EXIF or place/time evidence receives limited verification", () => {
  const result = evaluateCatchVerification({ photos: [photo()], caughtAt: now.toISOString(), now });
  assert.equal(result.status, "unverified");
  assert.equal(result.level, "limited");
  assert.equal(result.photoHash, hashA);
});

test("a photo captured near the selected water can verify later from its EXIF date and GPS", () => {
  const verification = evaluateCatchVerification({
    photos: [photo(hashA, { capturedAt: "2026-10-28T11:30:00.000Z", coordinates: { latitude: 50, longitude: 14 } })],
    water,
    caughtAt: "2026-10-28T11:35:00.000Z",
    now,
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "strong");
  assert.equal(verification.locationSource, "photo-exif");
  assert.equal(verification.gpsAccuracyMeters, null);
});

test("a same-day evening home entry can use original photo EXIF date and GPS", () => {
  const evening = new Date("2026-10-28T20:00:00.000Z");
  const verification = evaluateCatchVerification({
    photos: [photo(hashA, { capturedAt: "2026-10-28T08:15:00.000Z", coordinates: water.coordinates })],
    water, caughtAt: "2026-10-28T08:15:00.000Z", now: evening,
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "strong");
  assert.equal(verification.reason, "photo-date-and-location");
});

test("future EXIF capture time cannot form strong evidence", () => {
  const verification = evaluateCatchVerification({
    photos: [photo(hashA, { capturedAt: "2026-10-28T13:00:00.000Z", coordinates: water.coordinates })],
    water, caughtAt: "2026-10-28T13:00:00.000Z", now,
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "standard");
  assert.equal(verification.reason, "photo-gps-location");
});

test("manual map coordinates alone do not create trusted verification evidence", () => {
  const verification = evaluateCatchVerification({
    photos: [photo()],
    coordinates: water.coordinates,
    gpsSource: "manual-map",
    water,
    caughtAt: now.toISOString(),
    now,
  });
  assert.equal(verification.status, "unverified");
  assert.equal(verification.locationSource, null);
});

test("GPS at the 15-minute and 150-meter limits near a water is strong evidence", () => {
  const verification = evaluateCatchVerification({
    photos: [photo()], water, caughtAt: now.toISOString(), now,
    locationEvidence: {
      source: "live-gps", capturedAt: "2026-10-28T11:45:00.000Z", accuracyMeters: 150,
      coordinates: { latitude: 50, longitude: 14.009 },
    },
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "strong");
});

test("matching EXIF capture time alone is standard evidence", () => {
  const verification = evaluateCatchVerification({
    photos: [photo(hashA, { capturedAt: "2026-10-28T10:30:00.000Z", coordinates: null })],
    caughtAt: now.toISOString(), now,
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "standard");
  assert.equal(verification.locationSource, "photo-exif");
});

test("EXIF GPS alone is standard evidence when no matching catch time is available", () => {
  const verification = evaluateCatchVerification({
    photos: [photo(hashA, { capturedAt: null, coordinates: water.coordinates })],
    water, caughtAt: now.toISOString(), now,
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "standard");
  assert.equal(verification.reason, "photo-gps-location");
});

test("a completed time-matching Vycházka supports a later home entry at standard level", () => {
  const verification = evaluateCatchVerification({
    photos: [photo()], tripId: "trip-completed", activeTripId: null,
    trips: [{ id: "trip-completed", startedAt: "2026-10-28T06:00:00.000Z", endedAt: "2026-10-28T10:00:00.000Z" }],
    caughtAt: "2026-10-28T08:30:00.000Z", now,
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "standard");
  assert.equal(verification.locationSource, "trip");
});

test("a historical Catch uses its completed Vycházka as standard evidence, not current home GPS", () => {
  const verification = evaluateCatchVerification({
    photos: [photo()], tripId: "trip-completed", activeTripId: null,
    trips: [{ id: "trip-completed", startedAt: "2026-10-28T06:00:00.000Z", endedAt: "2026-10-28T10:00:00.000Z" }],
    water, caughtAt: "2026-10-28T08:30:00.000Z", now,
    locationEvidence: {
      source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 12,
      coordinates: { latitude: 49, longitude: 13 },
    },
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "standard");
  assert.equal(verification.locationSource, "trip");
});

test("a Catch just outside the historical trip tolerance does not match that trip", () => {
  const inTolerance = evaluateCatchVerification({
    photos: [photo()], tripId: "trip-completed", trips: [
      { id: "trip-completed", startedAt: "2026-10-28T06:00:00.000Z", endedAt: "2026-10-28T10:00:00.000Z" },
    ], caughtAt: "2026-10-28T10:30:00.000Z", now,
  });
  assert.equal(inTolerance.level, "standard");
  assert.equal(inTolerance.locationSource, "trip");

  const outsideTolerance = evaluateCatchVerification({
    photos: [photo()], tripId: "trip-completed", trips: [
      { id: "trip-completed", startedAt: "2026-10-28T06:00:00.000Z", endedAt: "2026-10-28T10:00:00.000Z" },
    ], caughtAt: "2026-10-28T10:31:00.000Z", now,
  });
  assert.equal(outsideTolerance.level, "limited");
  assert.equal(outsideTolerance.reason, "missing-trip-or-water-location");
});

test("an accurate app GPS capture without water or another location target is standard only", () => {
  const verification = evaluateCatchVerification({
    photos: [photo()], gpsSource: "live-gps", caughtAt: now.toISOString(), now,
    locationEvidence: {
      source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 30,
      coordinates: { latitude: 50, longitude: 14 },
    },
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.level, "standard");
  assert.equal(verification.locationSource, "live-gps");
});

test("EXIF GPS far from a selected water cannot be treated as matching-location evidence", () => {
  const verification = evaluateCatchVerification({
    photos: [photo(hashA, { capturedAt: now.toISOString(), coordinates: { latitude: 49, longitude: 13 } })],
    water, caughtAt: now.toISOString(), now,
  });
  assert.equal(verification.status, "unverified");
  assert.equal(verification.reason, "exif-location-mismatch");
});

test("all trust levels normalize consistently while legacy verified records remain standard", () => {
  const proof = {
    status: "verified", photoHash: hashA, locationSource: "live-gps",
    verifiedAt: now.toISOString(), reason: "live-gps-at-water",
  };
  assert.equal(normalizeCatchVerification({ ...proof, level: "strong" }).level, "strong");
  assert.equal(normalizeCatchVerification({ ...proof, level: "standard" }).level, "standard");

  const limited = normalizeCatchVerification({
    status: "unverified", level: "limited", reason: "missing-location", photoHash: hashA,
    photoCaptureMetadata: { capturedAt: now.toISOString(), coordinates: water.coordinates },
    locationSource: "photo-exif", gpsAccuracyMeters: 45,
  });
  assert.equal(limited.status, "unverified");
  assert.equal(limited.level, "limited");
  assert.equal(limited.locationSource, "photo-exif");
  assert.equal(limited.gpsAccuracyMeters, 45);
  assert.equal(limited.verifiedAt, null);

  const unverified = normalizeCatchVerification({ status: "unverified", reason: "missing-photo" });
  assert.equal(unverified.status, "unverified");
  assert.equal(unverified.level, "unverified");

  const legacyVerified = normalizeCatchVerification(proof);
  assert.equal(legacyVerified.status, "verified");
  assert.equal(legacyVerified.level, "standard");
  assert.equal(isCatchProgressionEligible({ verification: legacyVerified }), true);
});

test("an exact image hash cannot verify a second catch", () => {
  const result = evaluateCatchVerification({
    photos: [photo()], locationEvidence: {
      source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 10,
      coordinates: water.coordinates,
    }, water, caughtAt: now.toISOString(), now, usedPhotoHashes: new Set([hashA]),
  });
  assert.equal(result.status, "unverified");
  assert.equal(result.reason, "photo-already-used");
});

test("verification skips an already-used first photo when a later unique photo is available", () => {
  const uniqueHash = "c".repeat(64);
  const result = evaluateCatchVerification({
    photos: [photo(hashA), photo(uniqueHash)],
    caughtAt: now.toISOString(), now, usedPhotoHashes: new Set([hashA]),
  });
  assert.equal(result.level, "limited");
  assert.equal(result.reason, "missing-trip-or-water-location");
  assert.equal(result.photoHash, uniqueHash);
});

test("progression includes legacy catches, excludes unverified and deduplicates verified photo hashes", () => {
  const legacy = { id: "legacy", caughtAt: "2020-01-01T00:00:00.000Z", photos: [photo(hashA)] };
  const firstVerified = { id: "verified-1", caughtAt: "2026-01-01T00:00:00.000Z", photos: [photo("c".repeat(64))], verification: { status: "verified", photoHash: "c".repeat(64) } };
  const duplicate = { id: "verified-2", caughtAt: "2026-01-02T00:00:00.000Z", photos: [photo("c".repeat(64))], verification: { status: "verified", photoHash: "c".repeat(64) } };
  const unverified = { id: "unverified", photos: [], verification: { status: "unverified" } };
  assert.equal(isCatchProgressionEligible(legacy), true);
  assert.equal(isCatchProgressionEligible(unverified), false);
  assert.deepEqual(filterEligibleCatchRecords([duplicate, unverified, firstVerified, legacy]).map((item) => item.id), ["legacy", "verified-1"]);
  assert.equal(getCatchPhotoHash(photo(hashA)), hashA);
});

test("future Catch dates are excluded from progression after a five-minute clock-skew allowance", () => {
  const reference = new Date("2026-10-28T12:00:00.000Z");
  const withinSkew = { id: "clock-skew", caughtAt: "2026-10-28T12:04:59.000Z" };
  const future = { id: "future", caughtAt: "2026-10-28T12:05:01.000Z" };
  assert.equal(isCatchDateEligibleForProgression(withinSkew, reference), true);
  assert.equal(isCatchDateEligibleForProgression(future, reference), false);
  assert.equal(isCatchProgressionEligible(future, reference), false);
  assert.deepEqual(filterEligibleCatchRecords([withinSkew, future], { now: reference }).map((item) => item.id), ["clock-skew"]);
});
