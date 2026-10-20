import test from "node:test";
import assert from "node:assert/strict";
import { applyOnboardingLocationMode, getOnboardingLocationMode } from "./onboardingLocationPreference.js";

test("onboarding location modes map to scoped privacy precision without changing sharing defaults", () => {
  const base = {
    profileVisibility: "private",
    defaultCatchVisibility: "private",
    defaultPhotoVisibility: "private",
    defaultLocationPrecision: "none",
    privateSpotDefault: true,
    nearbyOptIn: false,
    nearbyLocationPrecision: "approximate",
    heatmapOptIn: false,
    scopeKey: "guest:angler-a",
  };

  for (const mode of ["exact", "approximate", "none"]) {
    const saved = applyOnboardingLocationMode(base, mode);
    assert.equal(getOnboardingLocationMode(saved), mode);
    assert.equal(saved.scopeKey, base.scopeKey);
    assert.equal(saved.defaultCatchVisibility, "private");
    assert.equal(saved.nearbyOptIn, false);
    assert.equal("coordinates" in saved, false);
  }
});

test("invalid onboarding location modes are rejected", () => {
  assert.throws(() => applyOnboardingLocationMode({}, "gps"), /Přesnost polohy není platná/);
});
