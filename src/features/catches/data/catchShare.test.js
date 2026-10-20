import test from "node:test";
import assert from "node:assert/strict";
import { createCatchShareData, formatCatchShareText, getCatchShareFileName } from "./catchShare.js";

test("share payload is explicitly limited to non-location catch details", () => {
  const shareData = createCatchShareData({
    species: "Štika",
    weightKg: 5.25,
    lengthCm: 82,
    caughtAt: "2026-06-17T09:00:00.000Z",
    coordinates: { latitude: 50.1, longitude: 14.4 },
    gpsLocation: { latitude: 50.1, longitude: 14.4 },
    locationName: "Soukromý revír",
    notes: "Soukromá poznámka",
    tripId: "private-trip",
  });
  assert.deepEqual(Object.keys(shareData), ["species", "rarity", "rarityKey", "weightKg", "weightSource", "lengthCm", "caughtAt", "waterName"]);
  assert.equal(JSON.stringify(shareData).includes("50.1"), false);
  assert.equal(JSON.stringify(shareData).includes("Soukrom"), false);
  assert.match(formatCatchShareText(shareData), /Štika/);
  assert.equal(getCatchShareFileName(shareData), "chytnucz-stika.png");
});

test("share payload normalizes invalid optional measurements and timestamps", () => {
  assert.deepEqual(createCatchShareData({ species: "Kapr", weightKg: Number.NaN, lengthCm: Infinity, caughtAt: "invalid" }), {
    species: "Kapr",
    rarity: "Běžný",
    rarityKey: "common",
    weightKg: null,
    weightSource: "manual",
    lengthCm: null,
    caughtAt: null,
    waterName: null,
  });
});

test("share card includes a saved Water name only when Catch privacy explicitly allows it", () => {
  const water = { id: "water-1", name: "Revír Dubový", scopeKey: "guest:test" };
  const record = {
    id: "catch-1", species: "Kapr", speciesKey: "commonCarp", waterId: "water-1",
    privacy: { visibility: "public", privateSpot: false, locationPrecision: "exact" },
    coordinates: { latitude: 50.123456, longitude: 14.123456 }, gpsLocation: "50.123456,14.123456",
    notes: "soukromá poznámka", tripId: "trip-private", ownerId: "owner", sync: { status: "conflict" },
  };
  const data = createCatchShareData(record, water);
  assert.equal(data.waterName, "Revír Dubový");
  assert.equal(JSON.stringify(data).includes("50.123456"), false);
  assert.equal(JSON.stringify(data).includes("trip-private"), false);
  assert.equal(JSON.stringify(data).includes("soukromá poznámka"), false);
  assert.equal(JSON.stringify(data).includes("owner"), false);
  assert.equal(createCatchShareData({ ...record, privacy: { visibility: "public", privateSpot: true, locationPrecision: "exact" } }, water).waterName, null);
  assert.equal(createCatchShareData({ ...record, privacy: { visibility: "public", privateSpot: false, locationPrecision: "approximate" } }, water).waterName, null);
  assert.equal(createCatchShareData({ ...record, waterId: "other" }, water).waterName, null);
});
