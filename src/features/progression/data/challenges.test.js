import test from "node:test";
import assert from "node:assert/strict";
import { buildChallengeOverview } from "./challenges.js";

const catches = [
  { id: "old", speciesKey: "carp", locationName: "Labe", waterId: "water-labe", caughtAt: "2026-06-08T10:00:00.000Z" },
  { id: "today-one", speciesKey: "carp", locationName: "Labe", waterId: "water-labe", caughtAt: "2026-06-15T09:00:00.000Z" },
  { id: "today-two", speciesKey: "pike", locationName: "Vltava", waterId: "water-vltava", caughtAt: "2026-06-16T09:00:00.000Z" },
  { id: "today-three", speciesKey: "perch", locationName: "Berounka", caughtAt: "2026-06-17T09:00:00.000Z" },
];

test("daily and weekly challenges reflect real catches and completed trips", () => {
  const overview = buildChallengeOverview(catches, [
    { id: "finished", startedAt: "2026-06-17T06:00:00.000Z", endedAt: "2026-06-17T12:00:00.000Z" },
    { id: "active", startedAt: "2026-06-17T13:00:00.000Z", endedAt: null },
  ], new Date("2026-06-17T14:00:00.000Z"));
  assert.deepEqual(overview.daily.map((task) => task.completed), [true, false, true]);
  assert.deepEqual(overview.weekly.map((task) => task.completed), [true, true]);
  assert.equal(overview.weekly[1].title, "Navštiv revír po 30 a více dnech");
});

test("no activity produces honest zero-progress challenges", () => {
  const overview = buildChallengeOverview([], [], new Date("2026-06-17T14:00:00.000Z"));
  assert.ok([...overview.daily, ...overview.weekly].every((task) => !task.completed && task.progress === 0));
});

test("malformed dates do not falsely count toward challenge progress", () => {
  const overview = buildChallengeOverview([{ id: "bad", speciesKey: "carp", caughtAt: "invalid" }], [], new Date("2026-06-17T14:00:00.000Z"));
  assert.ok([...overview.daily, ...overview.weekly].every((task) => !task.completed && task.progress === 0));
});

test("weekly water challenge counts a first stable-ID visit and ignores a visit yesterday", () => {
  const now = new Date("2026-10-19T10:00:00+02:00");
  const firstVisit = buildChallengeOverview([{ id: "first", waterId: "water-a", caughtAt: now.toISOString() }], [], now);
  const visitedYesterday = buildChallengeOverview([
    { id: "yesterday", waterId: "water-a", locationName: "Name A", caughtAt: "2026-10-18T10:00:00+02:00" },
    { id: "today", waterId: "water-a", locationName: "Renamed A", caughtAt: now.toISOString() },
  ], [], now);
  assert.equal(firstVisit.weekly[1].progress, 1);
  assert.equal(visitedYesterday.weekly[1].progress, 0);
});

test("weekly water challenge allows a visit after 31 days even when display name changed", () => {
  const now = new Date("2026-10-19T10:00:00+02:00");
  const overview = buildChallengeOverview([
    { id: "past", waterId: "water-a", locationName: "Starý název", caughtAt: "2026-09-18T10:00:00+02:00" },
    { id: "today", waterId: "water-a", locationName: "Nový název", caughtAt: now.toISOString() },
  ], [], now);
  assert.equal(overview.weekly[1].progress, 1);
});
