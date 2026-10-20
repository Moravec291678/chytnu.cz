import test from "node:test";
import assert from "node:assert/strict";
import { calculateWeeklyStreak, canUseStreakFreeze, getPragueStreakMonthKey, getPragueStreakWeekKey, getStreakWeekHistory } from "./streakModel.js";

const catches = [
  { id: "week-1", caughtAt: "2026-06-04T10:00:00.000Z" },
  { id: "week-2", caughtAt: "2026-06-11T10:00:00.000Z" },
];
const now = new Date("2026-06-17T10:00:00.000Z");

test("streak periods and freeze months use Europe/Prague calendar boundaries", () => {
  assert.equal(getPragueStreakWeekKey("2026-10-18T22:30:00.000Z"), "2026-10-19");
  assert.equal(getPragueStreakMonthKey("2026-06-30T22:30:00.000Z"), "2026-07");
});

test("one record in each consecutive Prague week builds the shared current streak", () => {
  assert.deepEqual(calculateWeeklyStreak(catches, now), {
    weeks: 2, isActive: true, lastCatchAt: "2026-06-11T10:00:00.000Z",
  });
});

test("freeze is available only for an active streak missing this week and within monthly cap", () => {
  assert.equal(canUseStreakFreeze(catches, [], now), true);
  assert.equal(canUseStreakFreeze([...catches, { id: "this-week", caughtAt: now.toISOString() }], [], now), false);
  assert.equal(canUseStreakFreeze(catches, [{ type: "streak.freeze.used", reasonKey: "streak.freeze.used:2026-06" }], now), false);
  assert.equal(canUseStreakFreeze(catches, [], new Date("2026-06-20T10:00:00.000Z")), false);
});

test("persisted freeze counts as one real qualifying period and appears in history", () => {
  const freeze = { type: "streak.freeze.used", periodKey: "2026-06-15", reasonKey: "streak.freeze.used:2026-06" };
  assert.deepEqual(calculateWeeklyStreak(catches, now, [freeze]), {
    weeks: 3, isActive: true, lastCatchAt: "2026-06-11T10:00:00.000Z",
  });
  assert.deepEqual(getStreakWeekHistory(catches, [freeze], now, 3).map((item) => item.status), ["catch", "catch", "freeze"]);
});
