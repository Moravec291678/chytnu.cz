import assert from "node:assert/strict";
import test from "node:test";
import { FEATURES, isFeatureEnabled } from "./featureFlags.js";

test("future social, challenge and monetization UI stays disabled without real features", () => {
  assert.ok(Object.values(FEATURES).every((enabled) => enabled === false));
  assert.equal(isFeatureEnabled("friends"), false);
  assert.equal(isFeatureEnabled("community"), false);
  assert.equal(isFeatureEnabled("publicSharing"), false);
  assert.equal(isFeatureEnabled("seasonalChallenges"), false);
  assert.equal(isFeatureEnabled("unknown-feature"), false);
});
