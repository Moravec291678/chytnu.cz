import assert from "node:assert/strict";
import test from "node:test";
import { getCatchStatistics } from "../../stats/utils/catchStatistics.js";
import { calculateSpeciesMastery } from "../../progression/data/progression.js";
import { buildInsights, buildSeasonStory, buildYearSummary } from "../../retrospectives/data/retrospectives.js";
import { getDistinctTripSpecies } from "../../trips/data/tripModel.js";

const quick = { id: "quick-1", captureMode: "quick", species: "Druh zatím neurčen", speciesKey: "",
  caughtAt: "2026-11-04T10:00:00.000Z", lengthCm: null, weightKg: null };
const legacy = { id: "legacy-1", species: "Vlastní ryba", caughtAt: quick.caughtAt, lengthCm: null, weightKg: 3 };
const known = { id: "known-1", species: "Kapr obecný", speciesKey: "carp", caughtAt: quick.caughtAt, lengthCm: 65, weightKg: null };

test("unknown quick species never creates species aggregates or artificial personal best", () => {
  const stats = getCatchStatistics([quick]);
  assert.equal(stats.catchCount, 1);
  assert.equal(stats.speciesCount, 0);
  assert.equal(stats.longestLengthCm, null);
  assert.equal(stats.biggestWeightKg, null);
  assert.deepEqual(calculateSpeciesMastery([quick]), []);
  assert.deepEqual(getDistinctTripSpecies([quick]), []);
  assert.equal(buildYearSummary([quick], [], 2026).species, 0);
  assert.equal(buildSeasonStory([quick], [], 2026).speciesCount, 0);
  assert.equal(buildInsights([quick, quick, quick]).find((row) => row.key === "species").value, null);
});

test("legacy custom species and completed quick catch species retain existing counting", () => {
  const completed = { ...quick, id: "quick-2", speciesKey: "pike", species: "Štika obecná" };
  const records = [quick, legacy, known, completed];
  const stats = getCatchStatistics(records);
  assert.equal(stats.catchCount, 4);
  assert.equal(stats.speciesCount, 3);
  assert.equal(stats.longestLengthCm, 65);
  assert.equal(stats.biggestWeightKg, 3);
  assert.equal(calculateSpeciesMastery(records).length, 3);
  assert.equal(getDistinctTripSpecies(records).length, 3);
  assert.equal(buildYearSummary(records, [], 2026).species, 3);
  assert.equal(buildSeasonStory(records, [], 2026).speciesCount, 3);
});
