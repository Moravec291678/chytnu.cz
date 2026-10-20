import test from "node:test";
import assert from "node:assert/strict";
import { buildSeasonalChallenge, calculateSeasonalChallengeXp } from "./seasonalChallenge.js";

test("seasonal challenge progress comes only from catches in the active season", () => {
  const challenge = buildSeasonalChallenge([
    { id: "heaviest-carp", speciesKey: "commonCarp", species: "Kapr obecný", weightKg: 4, caughtAt: "2026-10-01T08:00:00" },
    { speciesKey: "pike", species: "Štika obecná", weightKg: 3, caughtAt: "2026-10-02T08:00:00" },
    { speciesKey: "commonCarp", species: "Kapr obecný", caughtAt: "2026-07-01T08:00:00" },
    { caughtAt: "not-a-date" },
  ], new Date(2026, 9, 18));
  assert.equal(challenge.season, "Podzim");
  assert.equal(challenge.title, "Kapřan sezóny");
  assert.equal(challenge.totalCatches, 1);
  assert.equal(challenge.progressLabel, "1/1");
  assert.equal(challenge.completed, true);
  assert.equal(challenge.description, "Zaznamenej kapra s uvedenou hmotností.");
  assert.deepEqual(challenge.bestCatch, { id: "heaviest-carp", weightKg: 4 });
});

test("seasonal XP is issued once for each completed seasonal challenge across year boundaries", () => {
  const catches = [
    { caughtAt: "2026-12-01T08:00:00", conditions: { temperatureC: 3 } },
    { caughtAt: "2027-01-01T08:00:00", conditions: { temperatureC: 2 } },
    { speciesKey: "commonCarp", species: "Kapr obecný", weightKg: 6, caughtAt: "2026-10-01T08:00:00" },
    { caughtAt: "2026-07-01T23:00:00" },
  ];
  assert.equal(calculateSeasonalChallengeXp(catches), 300);
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

