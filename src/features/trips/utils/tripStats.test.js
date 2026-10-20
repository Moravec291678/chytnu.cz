import test from "node:test";
import assert from "node:assert/strict";
import { getTotalTripsHours, getTripCatchCount, getTripsCount } from "./tripStats.js";

test("Trip summary counts only catches linked to an existing Trip", () => {
  const trips = [{ id: "trip-a" }, { id: "trip-b" }];
  const catches = [
    { id: "a", tripId: "trip-a" },
    { id: "b", tripId: null },
    { id: "c", tripId: "removed-trip" },
  ];
  assert.equal(getTripsCount(trips), 2);
  assert.equal(getTripCatchCount(catches, trips), 1);
});

test("Trip hours use stored timestamps and ignore invalid durations", () => {
  assert.equal(getTotalTripsHours([
    { startedAt: "2026-10-20T08:00:00.000Z", endedAt: "2026-10-20T10:30:00.000Z" },
    { startedAt: "invalid", endedAt: "2026-10-20T12:00:00.000Z" },
  ]), 2);
});
