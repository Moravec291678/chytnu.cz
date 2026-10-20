import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLastYearSummary,
  buildPeriodComparison,
  buildStableSpeciesInsights,
  buildTopWaterInsights,
  getInsightsComparableRanges,
} from "./insightsPageData.js";

test("comparison and last-year windows match the same Prague calendar period", () => {
  const ranges = getInsightsComparableRanges(new Date("2026-06-15T12:00:00.000Z"));
  const rows = [
    { id: "current-first", caughtAt: "2025-12-31T23:00:00.000Z" },
    { id: "last-year", caughtAt: "2025-06-14T22:00:00.000Z", species: "Kapr", speciesKey: "carp", weightKg: 6, weightSource: "manual" },
    { id: "current", caughtAt: "2026-06-15T12:00:00.000Z", species: "Štika", speciesKey: "pike", weightKg: 9, weightSource: "estimated" },
    { id: "after-range", caughtAt: "2026-06-15T22:00:00.000Z" },
  ];

  const comparison = buildPeriodComparison(rows, ranges);
  assert.equal(comparison.currentCount, 2);
  assert.equal(comparison.previousCount, 1);
  assert.equal(comparison.changePercent, 100);
  assert.deepEqual(buildLastYearSummary(rows, ranges), {
    catchCount: 1,
    speciesCount: 1,
    biggestMeasuredCatch: rows[1],
  });
});

test("comparison handles empty previous period without inventing a percentage", () => {
  const result = buildPeriodComparison([
    { id: "new", caughtAt: "2026-06-15T12:00:00.000Z" },
  ], getInsightsComparableRanges(new Date("2026-06-15T12:00:00.000Z")));
  assert.equal(result.currentCount, 1);
  assert.equal(result.previousCount, 0);
  assert.equal(result.changePercent, null);
  assert.equal(result.comparable, false);
});

test("top Waters include only known stable waterIds and real period Catch/Trip counts", () => {
  const ranges = getInsightsComparableRanges(new Date("2026-06-15T12:00:00.000Z"));
  const result = buildTopWaterInsights([
    { id: "a", caughtAt: "2026-05-01T10:00:00.000Z", waterId: "lake" },
    { id: "b", caughtAt: "2026-05-02T10:00:00.000Z", waterId: "lake" },
    { id: "c", caughtAt: "2026-05-03T10:00:00.000Z", waterId: "missing", locationName: "Falešný revír" },
  ], [
    { id: "trip", startedAt: "2026-05-01T10:00:00.000Z", waterId: "river" },
  ], [{ id: "lake", name: "Rybník" }, { id: "river", name: "Řeka" }], ranges.current);

  assert.deepEqual(result.map(({ id, name, catches, trips }) => ({ id, name, catches, trips })), [
    { id: "lake", name: "Rybník", catches: 2, trips: 0 },
    { id: "river", name: "Řeka", catches: 0, trips: 1 },
  ]);
});

test("species insights group only by stable species ID, never by display name", () => {
  const range = getInsightsComparableRanges(new Date("2026-06-15T12:00:00.000Z")).current;
  const result = buildStableSpeciesInsights([
    { caughtAt: "2026-03-01T10:00:00.000Z", speciesKey: "carp", species: "Kapr" },
    { caughtAt: "2026-03-02T10:00:00.000Z", speciesKey: "carp", species: "Kapr obecný" },
    { caughtAt: "2026-03-03T10:00:00.000Z", species: "Kapr" },
  ], range);
  assert.deepEqual(result, [{ id: "carp", name: "Kapr obecný", count: 2 }]);
});
