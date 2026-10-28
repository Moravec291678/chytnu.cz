import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_CONFIG, validateProductConfig } from "./validateProductConfig.js";

const validOptions = { routeExists: () => true };
const altered = () => structuredClone(PRODUCT_CONFIG);

test("current product configuration passes every validation", () => {
  assert.deepEqual(validateProductConfig(validOptions), []);
});

test("validation detects duplicate persisted IDs and invalid XP", () => {
  const config = altered();
  config.achievements[1].id = config.achievements[0].id;
  config.xp.catch.base = -1;
  const errors = validateProductConfig({ ...validOptions, config });
  assert.ok(errors.some((error) => error.includes("Duplicate achievement ID")));
  assert.ok(errors.some((error) => error.includes("Invalid XP value: catch.base")));
});

test("validation detects invalid date windows and unknown challenge types", () => {
  const config = altered();
  config.seasons[0].months = [12];
  config.dailyChallenges[0].ruleKey = "fish-by-telepathy";
  const errors = validateProductConfig({ ...validOptions, config });
  assert.ok(errors.some((error) => error.includes("Invalid month/date window")));
  assert.ok(errors.some((error) => error.includes("Unsupported challenge type")));
});

test("validation detects broken notification deep links and invalid feature flags", () => {
  const config = altered();
  config.notificationCopy.achievement.deepLink = "/missing";
  config.features.newFeature = "yes";
  const errors = validateProductConfig({ ...validOptions, config, routeExists: (link) => link !== "/missing" });
  assert.ok(errors.some((error) => error.includes("Broken notification deepLink")));
  assert.ok(errors.some((error) => error.includes("Invalid feature flag")));
});

test("validation detects non-monotonic level thresholds", () => {
  const config = altered();
  config.ranks[1].minLevel = 5;
  const errors = validateProductConfig({ ...validOptions, config });
  assert.ok(errors.some((error) => error.includes("Non-monotonic rank threshold")));
});
