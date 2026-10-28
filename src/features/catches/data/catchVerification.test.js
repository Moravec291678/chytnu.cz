import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCatchVerification, filterEligibleCatchRecords, getCatchPhotoHash, isCatchProgressionEligible,
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

test("a current accurate app GPS fix plus active trip and a photo verifies", () => {
  const verification = evaluateCatchVerification({
    photos: [photo()],
    tripId: "trip-live",
    activeTripId: "trip-live",
    locationEvidence: {
      source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 18,
      coordinates: { latitude: 49, longitude: 13 },
    },
    caughtAt: now.toISOString(), now,
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.reason, "live-gps-active-trip");
  assert.equal(verification.locationSource, "live-gps");
  assert.equal(verification.gpsAccuracyMeters, 18);
  assert.equal(verification.photoHash, hashA);
  assert.equal(verification.verifiedAt, now.toISOString());
});

test("old or inaccurate GPS and GPS without a trip or nearby saved water cannot verify", () => {
  const base = { photos: [photo()], caughtAt: now.toISOString(), now, tripId: null, activeTripId: null, water };
  const old = evaluateCatchVerification({ ...base, locationEvidence: {
    source: "live-gps", capturedAt: "2026-10-28T11:56:00.000Z", accuracyMeters: 12, coordinates: water.coordinates,
  } });
  assert.equal(old.status, "unverified");
  assert.equal(old.reason, "stale-or-inaccurate-gps");
  const inaccurate = evaluateCatchVerification({ ...base, locationEvidence: {
    source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 180, coordinates: water.coordinates,
  } });
  assert.equal(inaccurate.status, "unverified");
  const noLocationBinding = evaluateCatchVerification({ ...base, locationEvidence: {
    source: "live-gps", capturedAt: "2026-10-28T11:59:30.000Z", accuracyMeters: 12,
    coordinates: { latitude: 49, longitude: 13 },
  } });
  assert.equal(noLocationBinding.reason, "missing-trip-or-water-location");
});

test("a photo captured near the selected water can verify later from its EXIF date and GPS", () => {
  const verification = evaluateCatchVerification({
    photos: [photo(hashA, { capturedAt: "2026-10-28T11:30:00.000Z", coordinates: { latitude: 50, longitude: 14 } })],
    water,
    caughtAt: "2026-10-28T11:35:00.000Z",
    now,
  });
  assert.equal(verification.status, "verified");
  assert.equal(verification.locationSource, "photo-exif");
  assert.equal(verification.gpsAccuracyMeters, null);
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
