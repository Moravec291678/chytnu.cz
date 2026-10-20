import test from "node:test";
import assert from "node:assert/strict";
import { getCatchPatterns, getCatchStatistics } from "./catchStatistics.js";
import { getCatchOutcomeStats } from "../../home/utils/profileStats.js";

test("empty journal contains no invented measurements and still returns a six-month window", () => {
  const stats = getCatchStatistics([], [], new Date("2026-10-16T12:00:00"));
  assert.equal(stats.catchCount, 0);
  assert.equal(stats.speciesCount, 0);
  assert.equal(stats.biggestWeightKg, null);
  assert.equal(stats.longestLengthCm, null);
  assert.deepEqual(stats.monthlyCatchCounts.map(({ count }) => count), [0, 0, 0, 0, 0, 0]);
});

test("missing and invalid measurements are excluded; custom species are grouped by normalized name", () => {
  const stats = getCatchStatistics([
    { species: "Štika", speciesKey: "custom-1", weightKg: null, lengthCm: undefined },
    { species: "Štika", speciesKey: "custom-1", weightKg: Number.NaN, lengthCm: -1 },
    { species: "Kapr", speciesKey: "carp", weightKg: 4.25, lengthCm: 62 },
  ]);
  assert.equal(stats.biggestWeightKg, 4.25);
  assert.equal(stats.longestLengthCm, 62);
  assert.equal(stats.speciesCount, 2);
  assert.equal(stats.species[0].label, "Štika");
});

test("release share uses only explicitly released or kept catches", () => {
  assert.deepEqual(getCatchOutcomeStats([
    { result: "released" }, { result: "kept" }, { result: "unspecified" }, {},
  ]), { released: 1, kept: 1, known: 2, percentageReleased: 50 });
  assert.equal(getCatchOutcomeStats([{ result: "unspecified" }]), null);
});

test("completed trip average counts only catches linked to completed trips", () => {
  const stats = getCatchStatistics([
    { tripId: "done" }, { tripId: "done" }, { tripId: "active" }, { tripId: null },
  ], [
    { id: "done", endedAt: "2026-10-10T12:00:00.000Z" },
    { id: "active", endedAt: null },
  ]);
  assert.equal(stats.completedTripsCount, 1);
  assert.equal(stats.activeTripsCount, 1);
  assert.equal(stats.averageCatchesPerCompletedTrip, 2);
});

test("monthly counts recalculate after a catch is edited or removed", () => {
  const now = new Date("2026-10-16T12:00:00");
  const record = { id: "catch-1", caughtAt: "2026-10-02T10:00:00" };
  assert.equal(getCatchStatistics([record], [], now).monthlyCatchCounts.at(-1).count, 1);
  const edited = { ...record, caughtAt: "2026-09-02T10:00:00" };
  const afterEdit = getCatchStatistics([edited], [], now);
  assert.equal(afterEdit.monthlyCatchCounts.at(-1).count, 0);
  assert.equal(afterEdit.monthlyCatchCounts.at(-2).count, 1);
  assert.equal(getCatchStatistics([], [], now).catchCount, 0);
});

test("catch patterns describe recorded conditions, count ties, and skip missing values", () => {
  const patterns = getCatchPatterns([
    {
      caughtAt: "2026-10-02T06:30:00",
      locationName: "Labe",
      baits: [{ label: "Boilie" }, { label: "Boilie" }],
      conditions: { pressureHpa: 1010, waterTempC: 12 },
    },
    {
      caughtAt: "2026-10-03T08:30:00",
      locationName: " LÁBE ",
      baits: [{ label: "Kukuřice" }],
      conditions: { pressureHpa: 1020, waterTemperatureC: 14 },
    },
    { caughtAt: "invalid", conditions: {} },
  ]);

  assert.deepEqual(patterns.time, { labels: ["06–09 h"], count: 2, sampleCount: 2 });
  assert.deepEqual(patterns.location, { labels: ["Labe"], count: 2, sampleCount: 2 });
  assert.deepEqual(patterns.bait, { labels: ["Boilie", "Kukuřice"], count: 1, sampleCount: 2 });
  assert.deepEqual(patterns.pressureHpa, { value: 1015, sampleCount: 2 });
  assert.deepEqual(patterns.waterTemperatureC, { value: 13, sampleCount: 2 });
  assert.deepEqual(getCatchPatterns([]), {
    time: null, location: null, bait: null, pressureHpa: null, waterTemperatureC: null,
  });
});
