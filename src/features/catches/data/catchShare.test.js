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
  assert.deepEqual(Object.keys(shareData), ["species", "weightKg", "weightSource", "lengthCm", "caughtAt"]);
  assert.equal(JSON.stringify(shareData).includes("50.1"), false);
  assert.equal(JSON.stringify(shareData).includes("Soukrom"), false);
  assert.match(formatCatchShareText(shareData), /Štika/);
  assert.equal(getCatchShareFileName(shareData), "chytnucz-stika.png");
});

test("share payload normalizes invalid optional measurements and timestamps", () => {
  assert.deepEqual(createCatchShareData({ species: "Kapr", weightKg: Number.NaN, lengthCm: Infinity, caughtAt: "invalid" }), {
    species: "Kapr",
    weightKg: null,
    weightSource: "manual",
    lengthCm: null,
    caughtAt: null,
  });
});
