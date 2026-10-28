import test from "node:test";
import assert from "node:assert/strict";
import { calculateServerCatchReward } from "./serverRewardCalculator.js";

const ownerId = "owner-1";
const now = Date.parse("2026-10-28T12:00:00.000Z");
const stamp = "2026-10-28T12:00:00.000Z";
const hash = "a".repeat(64);
const water = { id: "water-1", ownerId, coordinates: { latitude: 50, longitude: 14 } };
function catchRecord(overrides = {}) {
  const record = {
    id: "catch-1", ownerId, deleted: false, caughtAt: stamp, gpsSource: "default", coordinates: null,
    photos: [{ id: "photo-1", cloud: { state: "synced", provider: "cloudinary",
      objectKey: `users/${ownerId}/catches/catch-1/photos/photo-1/original`, sha256: hash } }],
    verification: { photoHash: hash }, conditions: null, tripId: null, waterId: "water-1",
  };
  return { ...record, ...overrides };
}

test("server assigns strong from a server-confirmed photo and a current nearby GPS fix", () => {
  const result = calculateServerCatchReward({
    catchRecord: catchRecord({ gpsSource: "live-gps", coordinates: water.coordinates,
      locationEvidence: { source: "live-gps", capturedAt: stamp, accuracyMeters: 25, coordinates: water.coordinates } }),
    ownerId, water, now,
  });
  assert.equal(result.level, "strong");
  assert.equal(result.targetXp, 15);
  assert.equal(result.events.reduce((sum, event) => sum + event.xp, 0), 15);
});

test("matching EXIF is an evidence signal but the server calculator makes no authenticity claim", () => {
  const result = calculateServerCatchReward({
    catchRecord: catchRecord({ verification: { photoCaptureMetadata: { capturedAt: stamp, coordinates: water.coordinates } } }),
    ownerId, water, now,
  });
  assert.equal(result.level, "strong");
  assert.equal(result.eligible, true);
});

test("a time-matching historical Vycházka supports standard without treating home GPS as trip evidence", () => {
  const result = calculateServerCatchReward({
    catchRecord: catchRecord({ tripId: "trip-1", caughtAt: "2026-10-28T08:00:00.000Z",
      locationEvidence: { source: "live-gps", capturedAt: stamp, accuracyMeters: 20, coordinates: { latitude: 49, longitude: 13 } } }),
    ownerId, trip: { id: "trip-1", ownerId, startedAt: "2026-10-28T06:00:00.000Z", endedAt: "2026-10-28T10:00:00.000Z" },
    water, now,
  });
  assert.equal(result.level, "standard");
  assert.equal(result.targetXp, 15);
});

test("photo without verifiable context is limited and manual-map is not treated as live GPS", () => {
  const result = calculateServerCatchReward({
    catchRecord: catchRecord({ gpsSource: "manual-map", coordinates: water.coordinates,
      conditions: { airTempC: 10, pressureHpa: 1011 } }),
    ownerId, water, now,
  });
  assert.equal(result.level, "limited");
  assert.equal(result.targetXp, 4);
  assert.equal(result.events[0].type, "catch.limited");
});

test("limited cap and repeated claims cannot add rewards twice", () => {
  const record = catchRecord();
  const capped = calculateServerCatchReward({ catchRecord: record, ownerId, now, dailyLimitedXp: 19 });
  assert.equal(capped.deltaXp, 1);
  const replay = calculateServerCatchReward({ catchRecord: record, ownerId, now, dailyLimitedXp: 20, currentXp: 1, limitedAlreadyClaimed: true });
  assert.equal(replay.deltaXp, 0);
  assert.deepEqual(replay.events, []);
});

test("later standard evidence awards only the outstanding XP after a limited reward", () => {
  const result = calculateServerCatchReward({
    catchRecord: catchRecord({ locationEvidence: { source: "live-gps", capturedAt: stamp,
      accuracyMeters: 30, coordinates: water.coordinates } }),
    ownerId, water, now, currentXp: 4,
  });
  assert.equal(result.level, "strong");
  assert.equal(result.deltaXp, 11);
  assert.equal(result.targetXp, 15);
});

test("missing photo, duplicate hash, and future Catch cannot earn server XP", () => {
  assert.equal(calculateServerCatchReward({ catchRecord: catchRecord({ photos: [] }), ownerId, now }).level, "unverified");
  assert.equal(calculateServerCatchReward({ catchRecord: catchRecord(), ownerId, duplicatePhoto: true, now }).deltaXp, 0);
  assert.equal(calculateServerCatchReward({ catchRecord: catchRecord({ caughtAt: "2026-10-29T12:00:00.000Z" }), ownerId, now }).deltaXp, 0);
});

test("duplicate earlier photo does not hide a later unique server-synced image", () => {
  const uniqueHash = "b".repeat(64);
  const record = catchRecord({ photos: [
    catchRecord().photos[0],
    { id: "photo-2", cloud: { state: "synced", provider: "cloudinary",
      objectKey: `users/${ownerId}/catches/catch-1/photos/photo-2/original`, sha256: uniqueHash } },
  ] });
  const result = calculateServerCatchReward({ catchRecord: record, ownerId,
    duplicatePhotoHashes: new Set([hash]), now });
  assert.equal(result.level, "limited");
  assert.equal(result.photoHash, uniqueHash);
});
