import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInsights,
  buildSeasonStory,
  buildSeasonStoryWithWaters,
  buildYearSummary,
  getAvailableSummaryYears,
  getBestCatchBait,
  getBestCatchMonth,
  createSeasonStoryShareData,
  formatSeasonStoryShareText,
} from "./retrospectives.js";

const catchRecord = (patch = {}) => ({ caughtAt: "2026-05-01T08:00:00", species: "Kapr", speciesKey: "carp", weightKg: null, lengthCm: null, method: null, baits: [], ...patch });

test("insights show only patterns supported by at least three records", () => {
  const rows = [1, 2, 3].map((n) => catchRecord({ id: n, method: { key: "float", label: "Plavaná" } }));
  const insights = buildInsights(rows);
  assert.equal(insights.find((item) => item.key === "method").value, "Plavaná");
  assert.equal(buildInsights(rows.slice(0, 2)).find((item) => item.key === "method").value, null);
});

test("species patterns use stable IDs and time buckets use Europe/Prague", () => {
  const rows = [1, 2, 3].map((id) => catchRecord({
    id,
    caughtAt: `2026-05-01T22:3${id}:00.000Z`,
    species: "Kapr",
    speciesKey: "carp-stable",
  }));
  const insights = buildInsights(rows);
  assert.equal(insights.find((item) => item.key === "time").value, "00:00");
  assert.equal(insights.find((item) => item.key === "species").value, "Kapr");
  assert.equal(buildInsights(rows.map((row) => ({ ...row, speciesKey: null, speciesId: null }))).find((item) => item.key === "species").value, null);
});

test("year summary uses only the selected year and measured personal bests", () => {
  const result = buildYearSummary([catchRecord({ weightKg: 4 }), catchRecord({ caughtAt: "2025-01-01", weightKg: 90 })], [], 2026);
  assert.equal(result.catches, 1); assert.equal(result.biggest.weightKg, 4); assert.equal(result.species, 1);
});

test("year summary returns an empty, non-invented state for a year without data", () => {
  const result = buildYearSummary([], [], 2040);
  assert.equal(result.year, 2040);
  assert.equal(result.catches, 0);
  assert.equal(result.trips, 0);
  assert.equal(result.biggest, null);
  assert.equal(result.largestRecordedCatch, null);
  assert.equal(result.bestMonth, null);
  assert.equal(result.bestBait, null);
});

test("year summary applies Prague calendar years to Catch and Trip start dates", () => {
  const catches = [
    catchRecord({ id: "included-at-boundary", caughtAt: "2025-12-31T23:00:00.000Z", weightKg: 2 }),
    catchRecord({ id: "excluded-at-boundary", caughtAt: "2026-12-31T23:00:00.000Z", weightKg: 20 }),
  ];
  const trips = [
    { id: "included", startedAt: "2025-12-31T23:30:00.000Z", createdAt: "2025-01-01T00:00:00.000Z" },
    { id: "excluded", startedAt: "2026-12-31T23:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
  ];
  const result = buildYearSummary(catches, trips, 2026);
  assert.equal(result.catches, 1);
  assert.equal(result.trips, 1);
  assert.equal(result.biggest.id, "included-at-boundary");
});

test("year summary keeps estimates visible but distinct from a measured record", () => {
  const result = buildYearSummary([
    catchRecord({ id: "weighed", weightKg: 4, weightSource: "manual" }),
    catchRecord({ id: "estimated", weightKg: 8, weightSource: "estimated" }),
  ], [], 2026);
  assert.equal(result.biggest.id, "weighed");
  assert.equal(result.largestRecordedCatch.id, "estimated");
});

test("best month is centralized by Prague month Catch count", () => {
  const rows = [
    catchRecord({ caughtAt: "2025-12-31T23:00:00.000Z" }),
    catchRecord({ caughtAt: "2026-01-15T10:00:00.000Z" }),
    catchRecord({ caughtAt: "2026-02-15T10:00:00.000Z" }),
  ];
  assert.deepEqual(getBestCatchMonth(rows), { key: "1", label: "leden", count: 2 });
  assert.deepEqual(buildYearSummary(rows, [], 2026).bestMonth, { key: "1", label: "leden", count: 2 });
});

test("best bait ignores missing and unknown entries and counts once per catch", () => {
  const rows = [
    catchRecord({ baits: [{ key: "boilie", label: "Boilie" }, { key: "boilie", label: "Boilie" }] }),
    catchRecord({ baits: [{ key: "boilie", label: "Boilie" }, { key: "unknown", label: "Neznámá" }] }),
    catchRecord({ baits: [{ key: "unset", label: "Neuvedeno" }, { label: "" }] }),
  ];
  assert.deepEqual(getBestCatchBait(rows), { key: "boilie", label: "Boilie", count: 2 });
  assert.deepEqual(buildYearSummary(rows, [], 2026).bestBait, { key: "boilie", label: "Boilie", count: 2 });
  assert.equal(getBestCatchBait([catchRecord({ baits: [{ key: "unknown", label: "Neznámá" }] })]), null);
});

test("available summary year selector includes years with Trips only", () => {
  assert.deepEqual(getAvailableSummaryYears([], [
    { startedAt: "2024-12-31T23:30:00.000Z" },
    { startedAt: "invalid", createdAt: "2023-06-01T12:00:00.000Z" },
  ], 2026), [2026, 2025, 2023]);
});

test("season story handles zero data and does not invent distance or highlights", () => {
  const result = buildSeasonStory([], [], 2026);
  assert.equal(result.catches, 0);
  assert.equal(result.trips, 0);
  assert.equal(result.distanceKm, null);
  assert.equal(result.favoriteWater, null);
  assert.equal(result.bestBait, null);
  assert.equal(result.bestMoment, null);
});

test("one Catch produces a truthful deterministic moment without fake measurements", () => {
  const result = buildSeasonStory([catchRecord({ id: "first", weightKg: null, lengthCm: null })], [], 2026);
  assert.equal(result.catches, 1);
  assert.equal(result.speciesCount, 1);
  assert.equal(result.bestMoment.kind, "first-catch");
  assert.equal(result.biggest, null);
});

test("season story uses only the selected year and picks measured PB, bait and month deterministically", () => {
  const rows = [
    catchRecord({ id: "a", caughtAt: "2026-05-01T08:00:00", weightKg: 7, weightSource: "manual", baits: [{ key: "corn", label: "Kukuřice" }] }),
    catchRecord({ id: "b", caughtAt: "2026-05-02T08:00:00", species: "Štika", speciesKey: "pike", weightKg: 9, weightSource: "estimated", lengthCm: 95, baits: [{ key: "corn", label: "Kukuřice" }] }),
    catchRecord({ id: "c", caughtAt: "2026-06-02T08:00:00", weightKg: 5, weightSource: "manual", baits: [{ key: "worm", label: "Žížala" }] }),
    catchRecord({ id: "old", caughtAt: "2025-05-01T08:00:00", weightKg: 99, weightSource: "manual", baits: [{ key: "old", label: "Stará" }] }),
  ];
  const result = buildSeasonStory(rows, [], 2026);
  assert.equal(result.catches, 3);
  assert.equal(result.speciesCount, 2);
  assert.equal(result.bestMoment.record.id, "a");
  assert.equal(result.bestMoment.kind, "weight-pb");
  assert.equal(result.bestBait.label, "Kukuřice");
  assert.equal(result.bestBait.count, 2);
  assert.equal(result.bestMonth.label, "květen");
  assert.equal(result.bestMonth.count, 2);
});

test("multiple Trips use only recorded distance fields in the requested year", () => {
  const trips = [
    { id: "one", startedAt: "2026-04-01T08:00:00", distanceKm: 12.4 },
    { id: "two", startedAt: "2026-06-01T08:00:00", distanceMeters: 3600 },
    { id: "missing", startedAt: "2026-07-01T08:00:00" },
    { id: "old", startedAt: "2025-07-01T08:00:00", distanceKm: 100 },
  ];
  const result = buildSeasonStory([], trips, 2026);
  assert.equal(result.trips, 3);
  assert.equal(result.distanceKm, 16);
  assert.equal(result.distanceTripCount, 2);
});

test("favorite Water requires a stable waterId and an actual saved Water", () => {
  const catches = [
    catchRecord({ id: "a", waterId: "water-a", locationName: "soukromý text" }),
    catchRecord({ id: "b", waterId: "water-a" }),
    catchRecord({ id: "c", waterId: "missing", locationName: "Vymyšlený" }),
  ];
  const trips = [{ id: "trip", startedAt: "2026-04-01T08:00:00", waterId: "water-b" }];
  const result = buildSeasonStoryWithWaters(catches, trips, [
    { id: "water-a", name: "Rybník A" },
    { id: "water-b", name: "Řeka B" },
  ], 2026);
  assert.deepEqual(result.favoriteWater, { id: "water-a", name: "Rybník A", catchCount: 2, tripCount: 0 });
  assert.equal(result.waterCount, 1);
});

test("share output uses an aggregate allowlist without Water, GPS, notes or internal IDs", () => {
  const story = buildSeasonStoryWithWaters([
    catchRecord({ id: "secret-id", waterId: "water-a", locationName: "Tajné místo", notes: "tajná poznámka", coordinates: { latitude: 50, longitude: 14 }, weightKg: 7, weightSource: "manual" }),
  ], [], [{ id: "water-a", name: "Soukromý revír" }], 2026);
  const data = createSeasonStoryShareData(story);
  const serialized = JSON.stringify(data);
  assert.equal(serialized.includes("secret-id"), false);
  assert.equal(serialized.includes("Soukromý revír"), false);
  assert.equal(serialized.includes("Tajné místo"), false);
  assert.equal(serialized.includes("latitude"), false);
  assert.match(formatSeasonStoryShareText(data), /Příběh sezóny 2026/i);
});
