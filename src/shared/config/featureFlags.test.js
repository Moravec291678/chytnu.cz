import assert from "node:assert/strict";
import test from "node:test";
import { FEATURES, isFeatureEnabled } from "./featureFlags.js";

test("future social, challenge and monetization UI stays disabled without real features", () => {
  assert.ok(Object.entries(FEATURES).every(([key, enabled]) => enabled === ["publicProfiles", "userDiscovery", "friends", "publicSharing"].includes(key)));
  assert.equal(isFeatureEnabled("publicProfiles"), true);
  assert.equal(isFeatureEnabled("friends"), true);
  assert.equal(isFeatureEnabled("community"), false);
  assert.equal(isFeatureEnabled("publicSharing"), true);
  assert.equal(isFeatureEnabled("seasonalChallenges"), false);
  assert.equal(isFeatureEnabled("unknown-feature"), false);
});
