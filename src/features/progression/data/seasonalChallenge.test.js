import test from "node:test";
import assert from "node:assert/strict";
import { buildSeasonalChallenge, calculateSeasonalChallengeXp, listCompletedSeasonalChallengeRewards } from "./seasonalChallenge.js";

test("seasonal challenge progress comes only from catches in the active season", () => {
  const challenge = buildSeasonalChallenge([
    { id: "heaviest-carp", speciesKey: "commonCarp", species: "Kapr obecný", weightKg: 4, caughtAt: "2026-10-01T08:00:00" },
    { speciesKey: "pike", species: "Štika obecná", weightKg: 3, caughtAt: "2026-10-02T08:00:00" },
    { speciesKey: "commonCarp", species: "Kapr obecný", caughtAt: "2026-07-01T08:00:00" },
    { caughtAt: "not-a-date" },
  ], new Date(2026, 9, 18));
  assert.equal(challenge.season, "Podzim");
  const carp = challenge.variants.find((variant) => variant.key === "carp");
  assert.equal(challenge.title, "Výzvy sezóny");
  assert.equal(challenge.variants.length, 3);
  assert.equal(carp.totalCatches, 1);
  assert.equal(carp.progressLabel, "1/1");
  assert.equal(carp.completed, true);
  assert.equal(carp.description, "Zaznamenej kapra s uvedenou délkou.");
  assert.deepEqual(carp.bestCatch, { id: "heaviest-carp", weightKg: 4 });
});

test("seasonal XP is issued once for each completed seasonal challenge across year boundaries", () => {
  const catches = [
    { caughtAt: "2026-12-01T08:00:00", conditions: { temperatureC: 3 } },
    { caughtAt: "2027-01-01T08:00:00", conditions: { temperatureC: 2 } },
    { speciesKey: "commonCarp", species: "Kapr obecný", weightKg: 6, caughtAt: "2026-10-01T08:00:00" },
    { caughtAt: "2026-07-01T23:00:00" },
  ];
  assert.equal(calculateSeasonalChallengeXp(catches, new Date("2027-02-18T12:00:00.000Z")), 300);
  assert.equal(buildSeasonalChallenge(catches, new Date(2026, 11, 18)).completed, true);
  assert.equal(buildSeasonalChallenge(catches, new Date(2027, 0, 18)).id, "season-2027-winter");
});

test("empty season starts honestly at zero", () => {
  const challenge = buildSeasonalChallenge([], new Date(2026, 5, 1));
  assert.equal(challenge.progress, 0);
  assert.equal(challenge.totalCatches, 0);
  assert.equal(challenge.completed, false);
  assert.equal(calculateSeasonalChallengeXp([]), 0);
});

test("summer challenge only counts real night catches", () => {
  const challenge = buildSeasonalChallenge([
    { caughtAt: "2026-07-01T12:00:00" },
    { caughtAt: "2026-07-02T23:30:00" },
  ], new Date(2026, 6, 3));
  assert.equal(challenge.title, "Noční rybaření");
  assert.equal(challenge.progress, 1);
  assert.equal(challenge.completed, true);
});

test("winter challenge requires a recorded temperature below five degrees", () => {
  const challenge = buildSeasonalChallenge([
    { caughtAt: "2026-12-01T08:00:00", conditions: { temperatureC: 5 } },
    { caughtAt: "2026-12-02T08:00:00", conditions: { airTempC: 4.9 } },
  ], new Date(2026, 11, 18));
  assert.equal(challenge.title, "Zimní warrior");
  assert.equal(challenge.progress, 1);
  assert.equal(challenge.completed, true);
});

test("autumn carp challenge requires the stable carp species ID and a reliable measurement", () => {
  const challenge = buildSeasonalChallenge([
    { id: "legacy-carp", species: "Kapr obecný", weightKg: 8, caughtAt: "2026-10-01T08:00:00Z" },
    { id: "estimated-carp", speciesKey: "commonCarp", weightKg: 8, weightSource: "estimated", caughtAt: "2026-10-02T08:00:00Z" },
  ], new Date("2026-10-18T10:00:00Z"));
  const carp = challenge.variants.find((variant) => variant.key === "carp");
  assert.equal(carp.progress, 0);
  assert.equal(carp.completed, false);
});

test("autumn challenge offers equal measured-catch paths for carp, predators, and salmonids or other fish", () => {
  const challenge = buildSeasonalChallenge([
    { id: "carp", speciesKey: "commonCarp", weightKg: 4, caughtAt: "2026-10-01T08:00:00Z" },
    { id: "pike", speciesKey: "northernPike", weightKg: 3, caughtAt: "2026-10-02T08:00:00Z" },
    { id: "trout", speciesKey: "brownTrout", weightKg: 1, caughtAt: "2026-10-03T08:00:00Z" },
    { id: "eel", speciesKey: "europeanEel", weightKg: 1, caughtAt: "2026-10-04T08:00:00Z" },
  ], new Date("2026-10-18T10:00:00Z"));
  const byKey = Object.fromEntries(challenge.variants.map((variant) => [variant.key, variant]));

  assert.deepEqual(challenge.variants.map(({ key }) => key), ["carp", "predator", "other"]);
  assert.deepEqual(challenge.variants.map(({ goal, xp }) => [goal, xp]), [[1, 100], [1, 100], [1, 100]]);
  assert.equal(byKey.carp.progress, 1);
  assert.equal(byKey.predator.progress, 1);
  assert.equal(byKey.other.progress, 1);
  assert.equal(byKey.carp.id, "season-2026-autumn");
  assert.equal(byKey.predator.id, "season-2026-autumn-predator");
  assert.equal(byKey.other.id, "season-2026-autumn-other");
});

test("seasonal ledger awards each autumn path once and preserves the legacy carp reward ID", () => {
  const catches = [
    { id: "pike", speciesKey: "northernPike", weightKg: 3, caughtAt: "2026-10-01T08:00:00Z" },
    { id: "carp", speciesKey: "commonCarp", weightKg: 4, caughtAt: "2026-10-02T08:00:00Z" },
    { id: "trout", speciesKey: "brownTrout", weightKg: 1, caughtAt: "2026-10-03T08:00:00Z" },
    { id: "eel", speciesKey: "europeanEel", weightKg: 1, caughtAt: "2026-10-04T08:00:00Z" },
  ];
  const rewards = listCompletedSeasonalChallengeRewards(catches);
  assert.deepEqual(rewards.map(({ challengeId, sourceEntityId }) => [challengeId, sourceEntityId]), [
    ["season-2026-autumn", "carp"],
    ["season-2026-autumn-predator", "pike"],
    ["season-2026-autumn-other", "trout"],
  ]);
  assert.equal(calculateSeasonalChallengeXp(catches), 300);
});

test("autumn predator counts a length-only pike and estimated weight never controls eligibility", () => {
  const challenge = buildSeasonalChallenge([
    { id: "pike-length", speciesKey: "northernPike", lengthCm: 85, caughtAt: "2026-10-12T08:00:00Z" },
    { id: "pike-estimated", speciesKey: "northernPike", lengthCm: 80, weightKg: 4, weightSource: "estimated", caughtAt: "2026-10-13T08:00:00Z" },
    { id: "carp-length", speciesKey: "commonCarp", lengthCm: 70, caughtAt: "2026-10-14T08:00:00Z" },
  ], new Date("2026-10-18T10:00:00Z"));
  const byKey = Object.fromEntries(challenge.variants.map((variant) => [variant.key, variant]));
  assert.equal(byKey.predator.totalCatches, 2);
  assert.deepEqual(byKey.predator.bestCatch, { id: "pike-length", lengthCm: 85 });
  assert.equal(byKey.carp.totalCatches, 1);
});

test("autumn weight-only legacy catches remain a fallback for existing logs", () => {
  const challenge = buildSeasonalChallenge([
    { id: "legacy-pike", speciesKey: "northernPike", weightKg: 3, caughtAt: "2026-10-12T08:00:00Z" },
  ], new Date("2026-10-18T10:00:00Z"));
  assert.equal(challenge.variants.find((variant) => variant.key === "predator").progress, 1);
});

