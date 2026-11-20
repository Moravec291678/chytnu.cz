import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distanceBetweenCoordinatesMeters, findNearbyCatalogueWaters, findNearestSavedWater, SAVED_WATER_MATCH_RADIUS_METERS } from "./nearbyWaterMatch.js";

const origin = { latitude: 50, longitude: 14 };

it("catalogue suggestions ignore missing and distant points and return only eight safe summaries", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id: String(index), number: "471001", name: "Revír", coordinates: { latitude: 50, longitude: 14 + index / 100 },
  }));
  const results = findNearbyCatalogueWaters(origin, [{ id: "missing" }, { id: "distant", coordinates: { latitude: 51, longitude: 14 } }, ...rows.reverse()]);
  assert.deepEqual(results.map(row => row.id), ["0", "1", "2", "3", "4", "5", "6", "7"]);
  assert.deepEqual(results[0], { id: "0", number: "471001", name: "Revír", approximateKm: 0 });
});

describe("saved water GPS suggestions", () => {
  it("uses a geographic distance and selects the nearest saved point within 300 m", () => {
    const nearby = [
      { id: "far", name: "Farther", coordinates: { latitude: 50, longitude: 14.002 } },
      { id: "near", name: "Nearest", waterNumber: "411001", coordinates: { latitude: 50, longitude: 14.001 } },
    ];
    const suggestion = findNearestSavedWater(origin, nearby);
    assert.equal(SAVED_WATER_MATCH_RADIUS_METERS, 300);
    assert.equal(suggestion.water.id, "near");
    assert.equal(suggestion.water.waterNumber, "411001");
    assert.ok(suggestion.distanceMeters > 50);
    assert.ok(suggestion.distanceMeters < 100);
  });

  it("does not suggest a point beyond the conservative radius", () => {
    assert.equal(findNearestSavedWater(origin, [{ id: "distant", name: "Distant", coordinates: { latitude: 50, longitude: 14.1 } }]), null);
  });

  it("ignores missing or invalid water and query coordinates", () => {
    const waters = [
      { id: "missing", name: "No point" },
      { id: "empty", name: "Empty point", coordinates: { latitude: null, longitude: null } },
      { id: "invalid", name: "Invalid", coordinates: { latitude: 95, longitude: 14 } },
    ];
    assert.equal(findNearestSavedWater(origin, waters), null);
    assert.equal(findNearestSavedWater({ latitude: 91, longitude: 14 }, waters), null);
    assert.equal(distanceBetweenCoordinatesMeters(origin, null), null);
  });
});
