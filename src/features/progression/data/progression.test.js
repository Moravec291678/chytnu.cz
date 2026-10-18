import test from "node:test";
import assert from "node:assert/strict";
import { ACHIEVEMENTS, calculateProgression, MAX_LEVEL, xpForLevel } from "./progression.js";

const makeCatch = (id, extra = {}) => ({ id, speciesKey: "carp", species: "Kapr", locationName: "Labe", photos: [], ...extra });

test("XP is derived once from current records and does not change after edit, retry, sync, or restore", () => {
  const catches = [makeCatch("one")];
  const original = calculateProgression(catches).xp;
  assert.equal(original, 60);
  assert.equal(calculateProgression([{ ...catches[0], notes: "edit" }]).xp, original);
  assert.equal(calculateProgression(structuredClone(catches)).xp, original);
  assert.equal(calculateProgression([{ ...catches[0], sync: { revision: 9 } }]).xp, original);
  assert.equal(calculateProgression([]).xp, 0);
});

test("catch XP uses the highest earned tier and adds the first-species bonus once", () => {
  const catches = [
    makeCatch("one", { photos: [{ id: "p" }], coordinates: { latitude: 50, longitude: 14 }, conditions: { source: "weather" } }),
    makeCatch("two", { photos: [{ id: "p2" }] }),
    makeCatch("three", { speciesKey: "pike", species: "Štika", locationName: "Vltava" }),
  ];
  assert.deepEqual(calculateProgression(catches).xpBreakdown, { catchXp: 45, speciesXp: 100 });
  assert.equal(calculateProgression(catches).xp, 145);
});

test("levels use deterministic increasing thresholds and stop at level 20", () => {
  assert.equal(xpForLevel(1), 0);
  assert.ok(xpForLevel(10) < xpForLevel(11));
  const many = Array.from({ length: 5000 }, (_, index) => makeCatch(String(index), { speciesKey: `s${index}`, locationName: `l${index}` }));
  assert.equal(calculateProgression(many).level, MAX_LEVEL);
  assert.equal(calculateProgression(many).progressPercent, 100);
});

test("every achievement has a stable unique ID and positive and negative behavior", () => {
  assert.equal(new Set(ACHIEVEMENTS.map((item) => item.id)).size, ACHIEVEMENTS.length);
  const negative = calculateProgression([], []).achievements;
  assert.ok(negative.every((item) => !item.isCompleted));
  const positive = calculateProgression(Array.from({ length: 10 }, (_, index) => makeCatch(String(index), {
    speciesKey: `species-${index}`,
    weightKg: index === 0 ? 10 : null,
    caughtAt: index === 0 ? "2026-06-01T21:30:00.000Z" : "2026-06-01T10:00:00.000Z",
  })), [{ id: "long-trip", startedAt: "2026-06-01T06:00:00.000Z", endedAt: "2026-06-01T14:00:00.000Z" }]).achievements;
  assert.ok(positive.every((item) => item.isCompleted));
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
  for (const [id, completed] of state) if (id !== "first-catch") assert.equal(completed, false, id);
});
