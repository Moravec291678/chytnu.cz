import test from "node:test";
import assert from "node:assert/strict";
import { ACHIEVEMENT_DEFINITIONS } from "./achievements.js";
import { DAILY_CHALLENGES, SEASONAL_CHALLENGE_SEASONS, WEEKLY_CHALLENGES } from "./challenges.js";
import { FEATURES } from "./featureFlags.js";
import { LEVEL_XP_BASE, MAX_LEVEL, MASTERY_LEVELS, RANKS } from "./levels.js";
import { NOTIFICATION_TYPES, NOTIFICATION_PREFERENCES } from "./notifications.js";
import { PRODUCT_LIMITS } from "./limits.js";
import { XP_RULES } from "./xp.js";

const deepHasFunction = (value) => {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(deepHasFunction);
};

test("product definitions are plain data with stable nonlocalized progression IDs", () => {
  const definitions = [...ACHIEVEMENT_DEFINITIONS, ...DAILY_CHALLENGES, ...WEEKLY_CHALLENGES, ...SEASONAL_CHALLENGE_SEASONS];
  assert.equal(deepHasFunction(definitions), false);
  for (const definition of definitions) assert.match(definition.id ?? definition.key, /^[a-z][a-z0-9-]*$/);
  assert.equal(new Set(ACHIEVEMENT_DEFINITIONS.map(({ id }) => id)).size, ACHIEVEMENT_DEFINITIONS.length);
  assert.deepEqual(ACHIEVEMENT_DEFINITIONS.slice(0, 3).map(({ id }) => id), ["first-catch", "first-kilo", "trophy-catch"]);
  assert.deepEqual(DAILY_CHALLENGES.map(({ id }) => id), ["daily-catch", "daily-species", "daily-trip"]);
  assert.deepEqual(WEEKLY_CHALLENGES.map(({ id }) => id), ["weekly-species", "weekly-water"]);
});

test("product configuration preserves current rewards, caps, and progression ranges", () => {
  assert.deepEqual(XP_RULES.catch, { base: 10, photo: 15, gpsAndWeather: 20 });
  assert.equal(XP_RULES.limitedCatch.dailyCap, 20);
  assert.equal(PRODUCT_LIMITS.photosPerCatch, 4);
  assert.equal(PRODUCT_LIMITS.legacyPhotosPerCatch, 10);
  assert.equal(PRODUCT_LIMITS.liveGpsMaxAgeMs, 15 * 60 * 1000);
  assert.equal(LEVEL_XP_BASE, 50);
  assert.equal(MAX_LEVEL, 100);
  assert.equal(RANKS.length, 7);
  assert.deepEqual(MASTERY_LEVELS.map(({ catches }) => catches), [1, 5, 20, 50, 100]);
  assert.deepEqual(NOTIFICATION_TYPES, ["sync_problem", "achievement", "challenge", "active_trip", "app_update"]);
  assert.equal(NOTIFICATION_PREFERENCES.length, 5);
  assert.ok(Object.values(FEATURES).every((enabled) => enabled === false));
});
