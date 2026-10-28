import test from "node:test";
import assert from "node:assert/strict";
import { anonymizePublicCoordinates, createCatchPrivacyFromDefaults, createPublicCatchProjection, DEFAULT_PRIVACY_SETTINGS, HEATMAP_GRANULARITY, normalizeCatchPrivacy, normalizePrivacySettings } from "./privacyModel.js";

test("new catches default to public visibility while existing Catch normalization stays private", () => {
  assert.deepEqual(normalizeCatchPrivacy(), {
    visibility: "private", photoVisibility: "private", locationPrecision: "none", privateSpot: true,
    nearbyEligible: false, heatmapEligible: false,
  });
  assert.deepEqual(normalizePrivacySettings({ showExactLocation: true }), {
    profileVisibility: "private", defaultCatchVisibility: "public", defaultCatchVisibilityExplicit: false, defaultPhotoVisibility: "private",
    defaultLocationPrecision: "none", privateSpotDefault: true, nearbyOptIn: false,
    nearbyLocationPrecision: "approximate", heatmapOptIn: false, heatmapGranularity: HEATMAP_GRANULARITY.OFF,
  });
  assert.equal(DEFAULT_PRIVACY_SETTINGS.defaultCatchVisibility, "public");
  assert.deepEqual(createCatchPrivacyFromDefaults(), {
    visibility: "public", photoVisibility: "private", locationPrecision: "none", privateSpot: true,
    nearbyEligible: false, heatmapEligible: false,
  });
});

test("explicit private default is preserved for new catches and onboarding preference writes", () => {
  const settings = normalizePrivacySettings({
    defaultCatchVisibility: "private",
    defaultCatchVisibilityExplicit: true,
  });
  assert.equal(settings.defaultCatchVisibility, "private");
  assert.equal(settings.defaultCatchVisibilityExplicit, true);
  assert.equal(createCatchPrivacyFromDefaults(settings).visibility, "private");

  const oldImplicitValue = normalizePrivacySettings({ defaultCatchVisibility: "private" });
  assert.equal(oldImplicitValue.defaultCatchVisibility, "public");
  assert.equal(oldImplicitValue.defaultCatchVisibilityExplicit, false);
});

test("nearby precision never normalizes to exact public coordinates", () => {
  assert.equal(normalizePrivacySettings({ nearbyLocationPrecision: "none" }).nearbyLocationPrecision, "none");
  assert.equal(normalizePrivacySettings({ nearbyLocationPrecision: "approximate" }).nearbyLocationPrecision, "approximate");
  assert.equal(normalizePrivacySettings({ nearbyLocationPrecision: "exact" }).nearbyLocationPrecision, "approximate");
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
  assert.equal(projection.locationArea, "50.0, 14.0");
  assert.equal(projection.locationArea.includes("50.123456"), false);
  const exactPrecisionProjection = createPublicCatchProjection({
    ...record,
    privacy: { visibility: "public", photoVisibility: "private", privateSpot: false, locationPrecision: "exact" },
  });
  assert.equal("coordinates" in exactPrecisionProjection, false);
  assert.equal("gpsLocation" in exactPrecisionProjection, false);
  assert.equal("locationArea" in exactPrecisionProjection, false);
  assert.equal(createPublicCatchProjection({
    ...record, locationArea: "50.123456, 14.123456", coordinates: null,
  }).locationArea, undefined);
  assert.equal(createPublicCatchProjection({ ...record, privacy: { visibility: "private" } }), null);
});

test("public coordinate anonymization only emits validated coarse coordinates", () => {
  assert.equal(anonymizePublicCoordinates({ latitude: 50.123456, longitude: 14.654321 }, "approximate"), "50.1, 14.7");
  assert.equal(anonymizePublicCoordinates({ latitude: 50.123456, longitude: 14.654321 }, "exact"), null);
  assert.equal(anonymizePublicCoordinates({ latitude: 95, longitude: 14 }, "approximate"), null);
});

test("a public Catch with a manually mapped private spot never exposes its precise coordinates", () => {
  const projection = createPublicCatchProjection({
    species: "Kapr", speciesKey: "commonCarp", caughtAt: "2026-10-19T10:00:00.000Z",
    gpsSource: "manual-map", gpsLocation: "49.123456, 14.654321",
    coordinates: { latitude: 49.123456, longitude: 14.654321 },
    privacy: { visibility: "public", photoVisibility: "private", privateSpot: true, locationPrecision: "none" },
  });
  assert.equal("coordinates" in projection, false);
  assert.equal("gpsLocation" in projection, false);
  assert.equal("locationArea" in projection, false);
});

test("heatmap granularity is normalized and legacy opt-in maps to area", () => {
  assert.equal(normalizePrivacySettings({ heatmapGranularity: "city" }).heatmapOptIn, true);
  assert.equal(normalizePrivacySettings({ heatmapGranularity: "off", heatmapOptIn: true }).heatmapOptIn, false);
  assert.equal(normalizePrivacySettings({ heatmapOptIn: true }).heatmapGranularity, HEATMAP_GRANULARITY.AREA);
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
