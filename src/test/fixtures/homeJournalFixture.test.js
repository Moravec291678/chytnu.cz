import test from "node:test";
import assert from "node:assert/strict";
import { buildChallengeOverview } from "../../features/progression/data/challenges.js";
import { buildSeasonalChallenge } from "../../features/progression/data/seasonalChallenge.js";
import { calculateProgression } from "../../features/progression/data/progression.js";
import { createHomeJournalFixture } from "./homeJournalFixture.js";

test("visual QA fixture is isolated data with current-season catches, real trip links, and progression", () => {
  const now = new Date("2026-10-18T16:00:00.000Z");
  const fixture = createHomeJournalFixture(now);
  assert.equal(fixture.catches.length, 8);
  assert.ok(fixture.catches.some((item) => item.weightKg === 12.4));
  assert.equal(fixture.catches.filter((item) => item.speciesKey).length, 8);
  assert.equal(fixture.catches.some((item) => item.tripId === "qa-trip-active"), true);
  assert.equal(fixture.trips.filter((trip) => !trip.endedAt).length, 1);
  assert.ok(buildSeasonalChallenge(fixture.catches, now).progress > 0);
  assert.ok(calculateProgression(fixture.catches, fixture.trips, { now }).xp > 0);
  assert.ok(buildChallengeOverview(fixture.catches, fixture.trips, now).weekly.some((item) => item.progress > 0));
});
