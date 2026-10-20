import test from "node:test";
import assert from "node:assert/strict";
import { resolveHomeEntry } from "./homeEntry.js";

test("a ready empty guest profile enters onboarding without requiring an account", () => {
  assert.equal(resolveHomeEntry({
    scopeReady: true,
    dataLoaded: true,
    onboardingComplete: false,
    hasReadError: false,
    hasLegacyRecords: false,
    legacyCheckComplete: true,
    legacyDataFound: false,
  }), "onboarding");
});

test("completed onboarding and legacy local data both keep direct Home access", () => {
  assert.equal(resolveHomeEntry({ scopeReady: true, onboardingComplete: true }), "home");
  assert.equal(resolveHomeEntry({ hasLegacyRecords: true }), "home");
  assert.equal(resolveHomeEntry({ hasReadError: true }), "home");
});
