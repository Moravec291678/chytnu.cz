import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalHeatmap, buildSpeciesHotspots, buildWaterHotspots } from "./hotspotStats.js";

const catches = [
  { id: "1", waterId: "water-a", locationName: "", species: "Kapr", speciesKey: "kapr", weightKg: 8.2, weightSource: "manual", caughtAt: "2026-06-03T08:00:00+02:00", coordinates: { latitude: 50.081, longitude: 14.421 } },
  { id: "2", waterId: "water-a", species: "Štika", speciesKey: "stika", caughtAt: "2026-06-04T08:00:00+02:00", coordinates: { latitude: 50.082, longitude: 14.422 } },
  { id: "3", locationName: "Místní rybník", species: "Kapr", speciesKey: "kapr", weightKg: 9.5, weightSource: "estimated", caughtAt: "2026-06-05T08:00:00+02:00", coordinates: { latitude: 49.9, longitude: 14.2 } },
  { id: "4", locationName: "", species: "", caughtAt: "invalid", coordinates: { latitude: 95, longitude: 14 } },
  { id: "5", locationName: "Bez GPS", species: "Lín", speciesKey: "lin", caughtAt: "2026-06-01T08:00:00+02:00" },
];
const waters = [{ id: "water-a", name: "Moje voda", waterNumber: "401 001" }];

test("top waters aggregate only supplied local catches and resolve saved Water names", () => {
  const result = buildWaterHotspots(catches, waters);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], {
    key: "id:water-a",
    name: "Moje voda",
    waterId: "water-a",
    catchCount: 2,
    species: ["Kapr", "Štika"],
    lastCatchAt: "2026-06-04T08:00:00+02:00",
  });
  assert.equal(result.some((item) => item.name === "Lipno"), false);
});

test("species aggregation counts actual catches and excludes estimated weights from PB", () => {
  const result = buildSpeciesHotspots(catches, waters);
  const carp = result.find((item) => item.key === "kapr");
  assert.equal(carp.catchCount, 2);
  assert.equal(carp.waterCount, 2);
  assert.equal(carp.bestWeightKg, 8.2);
});

test("local heatmap aggregates nearby own GPS into coarse cells and ignores invalid or missing GPS", () => {
  const result = buildLocalHeatmap(catches);
  assert.equal(result.length, 2);
  assert.equal(result.reduce((sum, item) => sum + item.catchCount, 0), 3);
  assert.equal(result[0].catchCount, 2);
  assert.equal(result[0].speciesCount, 2);
  assert.equal(Object.hasOwn(result[0], "latitude"), false);
  assert.equal(Object.hasOwn(result[0], "longitude"), false);
});
