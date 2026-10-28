import test from "node:test";
import assert from "node:assert/strict";
import {
  ACHIEVEMENTS,
  calculateProgression,
  calculateSpeciesMastery,
  calculateWeeklyStreak,
  getRankForLevel,
  MAX_LEVEL,
  xpForLevel,
} from "./progression.js";

const makeCatch = (id, extra = {}) => ({ id, speciesKey: "carp", species: "Kapr", locationName: "", photos: [], ...extra });

test("unverified Catch contributes no progression XP, mastery, or achievement progress while legacy XP is preserved", () => {
  const unverified = makeCatch("unverified", {
    caughtAt: "2026-10-28T10:00:00.000Z", waterId: "new-water", weightKg: 12,
    verification: { status: "unverified", reason: "missing-photo" },
  });
  const result = calculateProgression([unverified], [], { now: new Date("2026-10-28T12:00:00.000Z") });
  assert.equal(result.xp, 0);
  assert.equal(result.speciesCount, 0);
  assert.equal(result.locationCount, 0);
  assert.equal(result.achievements.find((item) => item.id === "first-catch").isCompleted, false);
  assert.deepEqual(result.mastery, []);
  assert.equal(calculateProgression([makeCatch("legacy")]).xp, 90);
});

test("XP is derived once from current records and does not change after edit, retry, sync, or restore", () => {
  const catches = [makeCatch("one")];
  const original = calculateProgression(catches).xp;
  assert.equal(original, 90);
  assert.equal(calculateProgression([{ ...catches[0], notes: "edit" }]).xp, original);
  assert.equal(calculateProgression(structuredClone(catches)).xp, original);
  assert.equal(calculateProgression([{ ...catches[0], sync: { revision: 9 } }]).xp, original);
  assert.equal(calculateProgression([]).xp, 0);
  assert.equal(calculateProgression(catches).xpBreakdown.catchXp, 10);
});

test("estimated weight does not count as a measured kilo or trophy achievement", () => {
  const estimated = makeCatch("estimate", { weightKg: 20, weightSource: "estimated" });
  const result = calculateProgression([estimated]);
  assert.equal(result.achievements.find((item) => item.id === "first-kilo").isCompleted, false);
  assert.equal(result.achievements.find((item) => item.id === "trophy-catch").isCompleted, false);
});

test("catch XP uses the highest earned tier and adds the first-species bonus once", () => {
  const catches = [
    makeCatch("one", { photos: [{ id: "p" }], coordinates: { latitude: 50, longitude: 14 }, conditions: { weather: "clear" } }),
    makeCatch("two", { photos: [{ id: "p2" }] }),
    makeCatch("three", { speciesKey: "pike", species: "Štika", locationName: "Vltava", waterId: "water-vltava" }),
  ];
  assert.deepEqual(calculateProgression(catches).xpBreakdown, {
    catchXp: 45,
    speciesXp: 100,
    locationXp: 30,
    dailyQuestXp: 0,
    weeklyQuestXp: 0,
    seasonalXp: 0,
    masteryXp: 0,
    streakXp: 0,
    achievementXp: 30,
  });
  assert.equal(calculateProgression(catches).xp, 205);
});

test("GPS alone or a moon phase alone do not earn weather XP", () => {
  const base = makeCatch("one", { coordinates: { latitude: 50, longitude: 14 } });
  const moonOnly = { ...base, conditions: { moonPhase: "full" } };
  assert.equal(calculateProgression([moonOnly]).xpBreakdown.catchXp, 10);
  assert.equal(calculateProgression([base]).xpBreakdown.catchXp, 10);
  assert.equal(calculateProgression([{ ...base, conditions: { airTempC: 10 } }]).xpBreakdown.catchXp, 20);
});

test("levels use deterministic increasing thresholds through level 100 and expose rank titles", () => {
  assert.equal(xpForLevel(1), 0);
  assert.ok(xpForLevel(10) < xpForLevel(11));
  assert.equal(MAX_LEVEL, 100);
  assert.equal(getRankForLevel(1).name, "Nováček");
  assert.equal(getRankForLevel(16).title, "Znalec vod");
  assert.equal(getRankForLevel(100).name, "Prestige I+");
  for (const [lastLevel, nextLevel, rankBefore, rankAfter] of [
    [5, 6, "Nováček", "Rybář"],
    [15, 16, "Rybář", "Zkušený rybář"],
    [29, 30, "Zkušený rybář", "Senior rybář"],
    [49, 50, "Senior rybář", "Expert"],
    [74, 75, "Expert", "Legenda"],
    [99, 100, "Legenda", "Prestige I+"],
  ]) {
    assert.equal(getRankForLevel(lastLevel).name, rankBefore, `level ${lastLevel}`);
    assert.equal(getRankForLevel(nextLevel).name, rankAfter, `level ${nextLevel}`);
    assert.equal(getRankForLevel(nextLevel - 1).name, rankBefore, `boundary before ${nextLevel}`);
  }
  const many = Array.from({ length: 10000 }, (_, index) => makeCatch(String(index), { speciesKey: `s${index}`, locationName: `l${index}` }));
  assert.equal(calculateProgression(many).level, 100);
  assert.equal(calculateProgression(many).nextThreshold, null);
  assert.equal(calculateProgression(many).progressPercent, 100);
});

test("every achievement has a stable unique ID and positive and negative behavior", () => {
  assert.equal(new Set(ACHIEVEMENTS.map((item) => item.id)).size, ACHIEVEMENTS.length);
  for (const achievement of ACHIEVEMENTS) {
    assert.equal(typeof achievement.id, "string");
    assert.equal(typeof achievement.category, "string");
    assert.equal(typeof achievement.title, "string");
    assert.equal(typeof achievement.rule, "string");
    assert.equal(typeof achievement.target, "number");
    assert.ok(achievement.target > 0);
    assert.ok(achievement.xp > 0);
    assert.equal(typeof achievement.hidden, "boolean");
  }
  const negative = calculateProgression([], []).achievements;
  assert.ok(negative.every((item) => !item.isCompleted));
  const positive = calculateProgression(Array.from({ length: 10 }, (_, index) => makeCatch(String(index), {
    speciesKey: `species-${index}`,
    weightKg: index === 0 ? 10 : null,
    caughtAt: index === 0 ? "2026-06-01T21:30:00.000Z" : "2026-06-01T10:00:00.000Z",
  })), [{ id: "long-trip", startedAt: "2026-06-01T06:00:00.000Z", endedAt: "2026-06-01T14:00:00.000Z" }]).achievements;
  const positiveById = new Map(positive.map((item) => [item.id, item.isCompleted]));
  for (const id of ["first-catch", "first-kilo", "trophy-catch", "ten-catches", "five-species", "ten-species", "summer-catch"]) {
    assert.equal(positiveById.get(id), true, id);
  }
  assert.equal(positive.find((item) => item.id === "night-catch").isCompleted, true);
  assert.equal(positive.find((item) => item.id === "marathon-trip").isCompleted, true);
});

test("Water exploration counts only stable Water IDs and exposes real progress", () => {
  const stableWaters = Array.from({ length: 5 }, (_, index) => makeCatch(`water-${index}`, {
    waterId: `water-id-${index}`,
    locationName: `Revír ${index}`,
  }));
  const completed = calculateProgression(stableWaters).achievements.find((item) => item.id === "five-waters");
  const freeTextOnly = calculateProgression(Array.from({ length: 8 }, (_, index) => makeCatch(`text-${index}`, {
    locationName: `Volný text ${index}`,
  }))).achievements.find((item) => item.id === "five-waters");

  assert.equal(completed.progress, 5);
  assert.equal(completed.target, 5);
  assert.equal(completed.isCompleted, true);
  assert.equal(freeTextOnly.progress, 0);
  assert.equal(freeTextOnly.isCompleted, false);
});

test("achievement boundaries do not unlock early", () => {
  const catches = Array.from({ length: 9 }, (_, index) => makeCatch(String(index), {
    speciesKey: `species-${index % 4}`,
    weightKg: index === 0 ? 0.99 : null,
    caughtAt: "2026-06-01T19:59:00.000Z",
  }));
  const trips = [{ startedAt: "2026-06-01T06:00:00.000Z", endedAt: "2026-06-01T13:59:59.000Z" }];
  const state = new Map(calculateProgression(catches, trips).achievements.map((item) => [item.id, item.isCompleted]));
  assert.equal(state.get("first-catch"), true);
  assert.equal(state.get("ten-catches"), false);
  assert.equal(state.get("first-kilo"), false);
  assert.equal(state.get("five-species"), false);
  assert.equal(state.get("marathon-trip"), false);
});

test("achievement progress uses journal measurements and excludes unrevealed hidden progress", () => {
  const catches = Array.from({ length: 47 }, (_, index) => makeCatch(String(index), {
    weightKg: index === 0 ? 6.8 : null,
    speciesKey: index < 3 ? `species-${index}` : "carp",
  }));
  const achievements = new Map(calculateProgression(catches).achievements.map((item) => [item.id, item]));
  assert.equal(achievements.get("trophy-catch").progress, 6.8);
  assert.equal(achievements.get("trophy-catch").goal, 10);
  assert.equal(achievements.get("fifty-catches").progress, 47);
  assert.equal(achievements.get("five-species").progress, 4);
  assert.equal(Object.hasOwn(achievements.get("night-catch"), "progress"), false);
});

test("species mastery awards each reached milestone exactly once per species", () => {
  const records = Array.from({ length: 20 }, (_, index) => makeCatch(String(index)));
  const [mastery] = calculateSpeciesMastery(records);
  assert.equal(mastery.catchCount, 20);
  assert.equal(mastery.level, 3);
  assert.equal(mastery.xp, 130);
  assert.equal(mastery.nextLevelAt, 50);
});

test("species mastery boundaries unlock only at 1, 5, 20, 50 and 100 catches", () => {
  for (const [count, expectedLevel] of [[1, 1], [4, 1], [5, 2], [19, 2], [20, 3], [50, 4], [100, 5]]) {
    const records = Array.from({ length: count }, (_, index) => makeCatch(String(index)));
    assert.equal(calculateSpeciesMastery(records)[0].level, expectedLevel, `${count} catches`);
  }
});

test("weekly streak counts consecutive active weeks and expires after seven inactive days", () => {
  const now = new Date("2026-06-17T12:00:00.000Z");
  const catches = [
    makeCatch("this-week", { caughtAt: "2026-06-16T10:00:00.000Z" }),
    makeCatch("last-week", { caughtAt: "2026-06-09T10:00:00.000Z" }),
    makeCatch("two-weeks", { caughtAt: "2026-06-02T10:00:00.000Z" }),
  ];
  const streak = calculateWeeklyStreak(catches, now);
  assert.equal(streak.weeks, 3);
  assert.equal(streak.isActive, true);
  assert.equal(streak.lastCatchAt, "2026-06-16T10:00:00.000Z");
  assert.deepEqual(streak, {
    weeks: 3,
    isActive: true,
    lastCatchAt: "2026-06-16T10:00:00.000Z",
  });
  assert.equal(calculateWeeklyStreak(catches, new Date("2026-06-25T12:00:00.000Z")).isActive, false);
  assert.throws(() => calculateWeeklyStreak([], "not a date"), TypeError);
});

test("daily and weekly quest XP is derived from completed catch, species, trip, and water challenges", () => {
  const catches = [
    makeCatch("a", { speciesKey: "a", caughtAt: "2026-06-01T10:00:00.000Z" }),
    makeCatch("b", { speciesKey: "b", locationName: "Labe", waterId: "water-labe", caughtAt: "2026-06-02T10:00:00.000Z" }),
    makeCatch("c", { speciesKey: "c", locationName: "Vltava", waterId: "water-vltava", caughtAt: "2026-06-03T10:00:00.000Z" }),
    makeCatch("d", { speciesKey: "c", locationName: "Berounka", caughtAt: "2026-06-03T12:00:00.000Z" }),
    makeCatch("e", { speciesKey: "a", locationName: "Labe", caughtAt: "2026-06-03T13:00:00.000Z" }),
  ];
  const result = calculateProgression(catches, [
    { id: "one", endedAt: "2026-06-03T18:00:00.000Z" },
    { id: "two", endedAt: "2026-06-03T20:00:00.000Z" },
  ]);
  assert.equal(result.xpBreakdown.dailyQuestXp, 125);
  assert.equal(result.xpBreakdown.weeklyQuestXp, 150);
  assert.equal(result.xpBreakdown.dailyQuestXp + result.xpBreakdown.weeklyQuestXp, 275);
});
