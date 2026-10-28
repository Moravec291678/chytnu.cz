import test from "node:test";
import assert from "node:assert/strict";
import { buildChallengeOverview } from "./challenges.js";
import { buildSeasonalChallenge, listCompletedSeasonalChallengeRewards } from "./seasonalChallenge.js";
import { listCompletedChallengeRewards } from "./challenges.js";

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

test("unverified catches do not complete XP-oriented daily, weekly, or seasonal challenges", () => {
  const record = {
    id: "unverified-carp", speciesKey: "commonCarp", species: "Kapr obecný", caughtAt: "2026-10-28T10:00:00.000Z",
    weightKg: 12, weightSource: "manual", verification: { status: "unverified", reason: "missing-photo" },
  };
  const now = new Date("2026-10-28T12:00:00.000Z");
  const overview = buildChallengeOverview([record], [], now);
  assert.equal(overview.daily.find((item) => item.id === "daily-catch").progress, 0);
  assert.equal(overview.daily.find((item) => item.id === "daily-species").progress, 0);
  assert.equal(buildSeasonalChallenge([record], now).variants[0].progress, 0);
  assert.deepEqual(listCompletedChallengeRewards([record]), []);
  assert.deepEqual(listCompletedSeasonalChallengeRewards([record]), []);
});

test("malformed dates do not falsely count toward challenge progress", () => {
  const overview = buildChallengeOverview([{ id: "bad", speciesKey: "carp", caughtAt: "invalid" }], [], new Date("2026-06-17T14:00:00.000Z"));
  assert.ok([...overview.daily, ...overview.weekly].every((task) => !task.completed && task.progress === 0));
});

test("species challenges require stable species IDs and use Prague day and week boundaries", () => {
  const now = new Date("2026-10-18T22:05:00.000Z"); // Monday 00:05 in Prague.
  const overview = buildChallengeOverview([
    { id: "before-midnight", speciesKey: "carp", caughtAt: "2026-10-18T21:59:00.000Z" },
    { id: "after-midnight-a", speciesKey: "pike", caughtAt: "2026-10-18T22:01:00.000Z" },
    { id: "after-midnight-b", species: "Okoun", caughtAt: "2026-10-18T22:02:00.000Z" },
  ], [], now);
  assert.equal(overview.daily[0].progress, 1);
  assert.equal(overview.daily[1].progress, 1);
  assert.equal(overview.weekly[0].progress, 1);
  assert.equal(overview.weekly[1].periodKey, "2026-10-19");
});

test("legacy display names without stable species IDs cannot earn species XP", async () => {
  const { listCompletedChallengeRewards } = await import("./challenges.js");
  const records = ["Kapr", "Štika", "Okoun"].map((species, index) => ({
    id: `legacy-${index}`, species, caughtAt: `2026-10-19T0${index}:00:00.000Z`,
  }));
  const overview = buildChallengeOverview(records, [], new Date("2026-10-19T10:00:00.000Z"));
  assert.equal(overview.weekly[0].progress, 0);
  assert.equal(listCompletedChallengeRewards(records).some((reward) => reward.challengeId === "weekly-species"), false);
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
