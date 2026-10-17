import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortCatches, hasActiveJournalFilters } from "./catchJournal.js";

const records = [
  { id: "a", species: "Kapr obecný", speciesKey: "carp", caughtAt: "2026-05-03T09:00:00.000Z", weightKg: null, lengthCm: null, locationName: "Labe", method: { key: "feeder", label: "Feeder" }, baits: [], notes: "", isFavorite: true, result: "released", tripId: "trip-1" },
  { id: "b", species: "Štika", speciesKey: "pike", caughtAt: "2026-05-02T09:00:00.000Z", weightKg: 2.4, lengthCm: 60, locationName: "Vltava", method: { key: "spinning", label: "Přívlač" }, baits: [{ label: "Guma" }], notes: "", isFavorite: false, result: "kept", tripId: null },
];

const defaults = { search: "", speciesKey: "", dateFrom: "", dateTo: "", favoriteOnly: false, result: "", methodKey: "", tripId: "", sort: "newest" };

test("journal search ignores Czech diacritics and filters by real fields", () => {
  assert.deepEqual(filterAndSortCatches(records, { ...defaults, search: "stika" }).map((item) => item.id), ["b"]);
  assert.deepEqual(filterAndSortCatches(records, { ...defaults, speciesKey: "carp", favoriteOnly: true, tripId: "trip-1" }).map((item) => item.id), ["a"]);
});

test("date, result and method filters combine without widening results", () => {
  assert.deepEqual(filterAndSortCatches(records, { ...defaults, dateFrom: "2026-05-03", dateTo: "2026-05-03", result: "released", methodKey: "feeder" }).map((item) => item.id), ["a"]);
  assert.deepEqual(filterAndSortCatches(records, { ...defaults, result: "kept", methodKey: "feeder" }), []);
});

test("missing measurements remain last in both measurement sort directions", () => {
  assert.deepEqual(filterAndSortCatches(records, { ...defaults, sort: "heaviest" }).map((item) => item.id), ["b", "a"]);
  assert.deepEqual(filterAndSortCatches(records, { ...defaults, sort: "lightest" }).map((item) => item.id), ["b", "a"]);
});

test("weight and length sorting use their own measurements in each direction", () => {
  const measured = [
    { ...records[0], id: "heavy-short", weightKg: 8, lengthCm: 40 },
    { ...records[1], id: "light-long", weightKg: 2, lengthCm: 80 },
    { ...records[0], id: "unknown" },
  ];
  const ids = (sort) => filterAndSortCatches(measured, { ...defaults, sort }).map((item) => item.id);
  assert.deepEqual(ids("heaviest"), ["heavy-short", "light-long", "unknown"]);
  assert.deepEqual(ids("lightest"), ["light-long", "heavy-short", "unknown"]);
  assert.deepEqual(ids("longest"), ["light-long", "heavy-short", "unknown"]);
  assert.deepEqual(ids("shortest"), ["heavy-short", "light-long", "unknown"]);
});

test("date sorting and empty-filter reset state are deterministic", () => {
  assert.deepEqual(filterAndSortCatches(records, { ...defaults, sort: "oldest" }).map((item) => item.id), ["b", "a"]);
  assert.equal(hasActiveJournalFilters(defaults), false);
  assert.equal(hasActiveJournalFilters({ ...defaults, favoriteOnly: true }), true);
});
