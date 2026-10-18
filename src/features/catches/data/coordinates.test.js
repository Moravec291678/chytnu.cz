import test from "node:test";
import assert from "node:assert/strict";
import { formatCoordinates, normalizeCoordinates, parseCoordinateText } from "./coordinates.js";

test("coordinates accept valid values including geographic boundaries", () => {
  assert.deepEqual(normalizeCoordinates({ latitude: -90, longitude: -180 }), { latitude: -90, longitude: -180 });
  assert.deepEqual(normalizeCoordinates({ latitude: 90, longitude: 180 }), { latitude: 90, longitude: 180 });
  assert.deepEqual(parseCoordinateText("49.5626, 15.9392"), { latitude: 49.5626, longitude: 15.9392 });
  assert.equal(formatCoordinates({ latitude: 49.5, longitude: 14.25 }, 4), "49.5000, 14.2500");
});

test("coordinates reject invalid, ambiguous, and out-of-range values", () => {
  for (const value of [
    { latitude: -90.1, longitude: 0 }, { latitude: 0, longitude: 180.1 },
    { latitude: Number.NaN, longitude: 1 }, null,
  ]) assert.equal(normalizeCoordinates(value), null);
  assert.equal(parseCoordinateText("49,5,14,4"), null);
  assert.equal(parseCoordinateText("somewhere"), null);
  assert.equal(parseCoordinateText(""), null);
});
