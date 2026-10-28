import test from "node:test";
import assert from "node:assert/strict";
import { applyManualMapLocation } from "./manualMapLocation.js";
import { resolveCatchMapStart } from "./manualMapLocation.js";

test("manual map selection changes the catch location source without altering other draft evidence", () => {
  const exif = { capturedAt: "2026-07-01T10:00:00.000Z", coordinates: { latitude: 49, longitude: 14 } };
  const liveEvidence = { source: "live-gps", capturedAt: "2026-07-01T10:02:00.000Z", accuracyMeters: 20, coordinates: { latitude: 49, longitude: 14 } };
  const draft = {
    speciesKey: "commonCarp", notes: "Poznámka", gpsSource: "live-gps", locationEvidence: liveEvidence,
    photos: [{ id: "photo-1", captureMetadata: exif }],
  };
  const changed = applyManualMapLocation(draft, { latitude: 50.1234567, longitude: 14.1234567 });
  assert.equal(changed.gpsSource, "manual-map");
  assert.deepEqual(changed.coordinates, { latitude: 50.1234567, longitude: 14.1234567 });
  assert.equal(changed.gpsLocation, "50.123457, 14.123457");
  assert.equal(changed.notes, draft.notes);
  assert.equal(changed.locationEvidence, liveEvidence);
  assert.equal(changed.photos[0].captureMetadata, exif);
});

test("map picker starts at catch, selected water, or a Czechia default in that order", () => {
  assert.deepEqual(resolveCatchMapStart({ latitude: 48, longitude: 16 }, { latitude: 49, longitude: 14 }), {
    coordinates: { latitude: 48, longitude: 16 }, zoom: 15,
  });
  assert.deepEqual(resolveCatchMapStart(null, { latitude: 49, longitude: 14 }), {
    coordinates: { latitude: 49, longitude: 14 }, zoom: 13,
  });
  assert.deepEqual(resolveCatchMapStart(null, null), {
    coordinates: { latitude: 49.8, longitude: 15.5 }, zoom: 7,
  });
});

test("invalid map points cannot be saved", () => {
  assert.throws(() => applyManualMapLocation({ notes: "preserve" }, { latitude: 91, longitude: 14 }), /platná/);
});
