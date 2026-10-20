import test from "node:test";
import assert from "node:assert/strict";
import {
  getWaterCatchSeasonCounts,
  buildVisitedWaterCollections,
  getWaterHourlyCatchRate,
  getWaterRelatedCatches,
  getWaterRelatedTrips,
  getWaterTodayTripCount,
} from "./waterDetailStats.js";

test("Collections lists only saved Waters reached by stable waterId and counts linked activity", () => {
  const waters = [
    { id: "water-a", name: "Rybník A", type: "Rybník" },
    { id: "water-b", name: "Řeka B", type: "Řeka" },
    { id: "unused", name: "Nepoužívaný revír" },
  ];
  const collections = buildVisitedWaterCollections(waters, [
    { id: "catch-a", waterId: "water-a", tripId: "trip-linked" },
    { id: "legacy", locationName: "Řeka B" },
  ], [
    { id: "trip-a", waterId: "water-a" },
    { id: "trip-linked" },
    { id: "legacy-name-only", locationName: "Řeka B" },
  ]);
  assert.deepEqual(collections, [
    { id: "water-a", name: "Rybník A", type: "Rybník", catchCount: 1, tripCount: 2 },
  ]);
});

test("Water links catches by stable ID and only uses an unambiguous legacy number", () => {
  const water = { id: "water-a", name: "Rybník", waterNumber: "401 018" };
  const waters = [water, { id: "water-b", name: "Jiný rybník", waterNumber: "401018" }];
  const catches = [
    { id: "current", waterId: "water-a" },
    { id: "foreign", waterId: "water-b", waterNumber: "401 018" },
    { id: "ambiguous-legacy", waterNumber: "401018" },
  ];
  assert.deepEqual(getWaterRelatedCatches(water, catches, waters).map(({ id }) => id), ["current"]);
  assert.deepEqual(getWaterRelatedCatches(water, [{ id: "legacy", waterNumber: "401018" }], [water]).map(({ id }) => id), ["legacy"]);
});

test("Water trip count includes direct, catch-linked and exact-name legacy trips", () => {
  const water = { id: "water-a", name: "Rybník Dubový", waterNumber: "401 018" };
  const trips = [
    { id: "direct", waterId: "water-a" },
    { id: "catch-linked" },
    { id: "name-linked", locationName: "rybník dubový" },
    { id: "unrelated", locationName: "Jiná voda" },
  ];
  assert.deepEqual(getWaterRelatedTrips(water, trips, [{ tripId: "catch-linked" }]).map(({ id }) => id), ["direct", "catch-linked", "name-linked"]);
});

test("Water today count uses actual trip start dates", () => {
  const trips = [
    { startedAt: "2026-10-20T08:00:00" },
    { startedAt: "2026-10-19T23:59:00" },
    { startedAt: "invalid" },
  ];
  assert.equal(getWaterTodayTripCount(trips, new Date("2026-10-20T12:00:00")), 1);
});

test("season panel counts only water-linked catches with valid dates", () => {
  const seasons = getWaterCatchSeasonCounts([
    { caughtAt: "2026-04-10T10:00:00" },
    { caughtAt: "2026-07-10T10:00:00" },
    { caughtAt: "2026-12-10T10:00:00" },
    { caughtAt: "invalid" },
  ]);
  assert.deepEqual(seasons.map(({ key, count }) => [key, count]), [
    ["spring", 1], ["summer", 1], ["autumn", 0], ["winter", 1],
  ]);
});

test("hourly catch rate uses only linked catches during completed trip effort", () => {
  const trips = [
    { id: "trip-a", startedAt: "2026-10-20T05:00:00", endedAt: "2026-10-20T10:00:00" },
  ];
  const catches = [
    { tripId: "trip-a", caughtAt: "2026-10-20T05:30:00" },
    { tripId: "trip-a", caughtAt: "2026-10-20T05:45:00" },
    { tripId: "trip-a", caughtAt: "2026-10-20T08:10:00" },
    { tripId: "other-trip", caughtAt: "2026-10-20T06:00:00" },
  ];
  const result = getWaterHourlyCatchRate(trips, catches);
  assert.equal(result.sufficient, true);
  assert.equal(result.effortHours, 5);
  assert.equal(result.catchCount, 3);
  assert.equal(result.hours[5].catchesPerHour, 2);
  assert.equal(result.hours[8].catchesPerHour, 1);
  assert.equal(result.hours[6].catchesPerHour, 0);
});

test("hourly catch rate requires enough measured trip effort", () => {
  const result = getWaterHourlyCatchRate([
    { id: "short", startedAt: "2026-10-20T05:00:00", endedAt: "2026-10-20T06:30:00" },
  ], []);
  assert.equal(result.sufficient, false);
  assert.equal(result.effortHours, 1.5);
  assert.deepEqual(result.hours, []);
});
