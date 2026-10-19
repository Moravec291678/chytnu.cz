import test from "node:test";
import assert from "node:assert/strict";
import { createPublicCatchProjection, normalizeCatchPrivacy, normalizePrivacySettings } from "./privacyModel.js";

test("privacy defaults are private and exact location requires location sharing", () => {
  assert.deepEqual(normalizeCatchPrivacy(), {
    visibility: "private", photoVisibility: "private", locationPrecision: "none", privateSpot: true,
    nearbyEligible: false, heatmapEligible: false,
  });
  assert.deepEqual(normalizePrivacySettings({ showExactLocation: true }), {
    profileVisibility: "private", defaultCatchVisibility: "private", defaultPhotoVisibility: "private",
    defaultLocationPrecision: "none", privateSpotDefault: true, nearbyOptIn: false, heatmapOptIn: false,
  });
});

test("public projection exposes only an explicit allowlist", () => {
  const record = {
    id: "catch-1", ownerId: "angler", species: "Kapr", speciesKey: "carp", caughtAt: "2026-10-19T10:00:00.000Z",
    weightKg: 8, lengthCm: 75, notes: "tajná poznámka", gpsLocation: "50,14", coordinates: { latitude: 50, longitude: 14 },
    locationName: "Soukromý revír", photos: [{ id: "p", type: "image/jpeg", storagePath: "private/path", size: 10, blob: new Blob(["x"]) }],
    privacy: { visibility: "public", photoVisibility: "public", privateSpot: false, locationPrecision: "approximate" },
  };
  const projection = createPublicCatchProjection(record);
  assert.equal(projection.species, "Kapr");
  assert.equal("notes" in projection, false);
  assert.equal("gpsLocation" in projection, false);
  assert.equal("coordinates" in projection, false);
  assert.equal("locationName" in projection, false);
  assert.equal(projection.photos.length, 0);
  assert.equal("ownerId" in projection, false);
  assert.equal("id" in projection, false);
  assert.equal(JSON.stringify(projection).includes("storagePath"), false);
  assert.equal(createPublicCatchProjection({ ...record, privacy: { visibility: "private" } }), null);
});

test("private spot overrides location and aggregate eligibility", () => {
  const privacy = normalizeCatchPrivacy({
    visibility: "public", privateSpot: true, locationPrecision: "exact", nearbyEligible: true, heatmapEligible: true,
  });
  assert.deepEqual(privacy, {
    visibility: "public", photoVisibility: "private", locationPrecision: "none", privateSpot: true,
    nearbyEligible: false, heatmapEligible: false,
  });
});
