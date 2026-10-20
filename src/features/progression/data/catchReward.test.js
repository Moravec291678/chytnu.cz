import test from "node:test";
import assert from "node:assert/strict";
import { buildCatchReward } from "./catchReward.js";

test("new catch reward is derived from persisted record data and prior journal", () => {
  const catchRecord = {
    id: "new",
    speciesKey: "pike",
    species: "Štika",
    caughtAt: "2026-10-17T09:00:00.000Z",
    weightKg: 4,
    photos: [{ id: "photo" }],
    locationName: "Vltava",
    waterId: "water-vltava",
  };
  const reward = buildCatchReward(catchRecord, [], [], new Date("2026-10-17T12:00:00.000Z"));
  assert.equal(reward.xp, 255);
  assert.equal(reward.breakdown.catchXp, 15);
  assert.equal(reward.breakdown.speciesXp, 50);
  assert.equal(reward.breakdown.locationXp, 30);
  assert.equal(reward.breakdown.dailyQuestXp, 25);
  assert.equal(reward.breakdown.weeklyQuestXp, 75);
  assert.equal(reward.breakdown.achievementXp, 60);
  assert.equal(reward.newSpecies, true);
  assert.equal(reward.personalRecord, true);
  assert.equal(reward.speciesRecord, true);
  assert.doesNotThrow(() => structuredClone(reward));
});

test("editing another catch does not issue a new-catch reward", () => {
  const existing = {
    id: "existing",
    speciesKey: "carp",
    species: "Kapr",
    caughtAt: "2026-10-17T09:00:00.000Z",
    weightKg: 3,
    photos: [],
    locationName: "",
  };
  const reward = buildCatchReward({
    ...existing,
    id: "second",
    weightKg: 2,
  }, [existing], [], new Date("2026-10-17T12:00:00.000Z"));
  assert.equal(reward.newSpecies, false);
  assert.equal(reward.speciesRecord, false);
  assert.equal(reward.personalRecord, false);
});
