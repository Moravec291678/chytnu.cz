import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { completeOnboarding, isOnboardingComplete, readPreferences, savePreferences } from "./preferences.js";
import { hasLegacyProfileData, hasScopedRecords } from "./legacyProfile.js";
import { CATCH_STORE_NAME, openLocalDatabase } from "../../catches/data/catchRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";

function memoryStorage() { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }

test("preferences persist settings and merge notification toggles across reads", () => {
  const storage = memoryStorage();
  savePreferences({ detailMode: "detailed", notifications: { weather: true } }, storage);
  const loaded = readPreferences(storage);
  assert.equal(loaded.detailMode, "detailed");
  assert.equal(loaded.notifications.weather, true);
  assert.equal(loaded.notifications.streak, true);
});

test("onboarding completion persists independently per data scope and malformed storage falls back", () => {
  const storage = memoryStorage();
  assert.equal(isOnboardingComplete("guest-a", storage), false);
  completeOnboarding("guest-a", storage);
  assert.equal(isOnboardingComplete("guest-a", storage), true);
  assert.equal(isOnboardingComplete("guest-b", storage), false);
  assert.equal(readPreferences({ getItem: () => "{" }).detailMode, "simple");
});

test("legacy global completion migrates once to the active scope, then stays isolated", () => {
  const storage = memoryStorage();
  savePreferences({ onboardingComplete: true }, storage);
  assert.equal(isOnboardingComplete("guest-legacy", storage), true);
  assert.equal(isOnboardingComplete("guest-other", storage), false);
});

test("legacy profile evidence is scoped so another profile never receives its onboarding bypass", () => {
  const records = [{ scopeKey: "guest-a" }, { scopeKey: "account-b" }];
  assert.equal(hasScopedRecords(records, "guest-a"), true);
  assert.equal(hasScopedRecords(records, "guest-c"), false);
});

test("existing scoped catch data is detected for onboarding compatibility", async () => {
  const db = await openLocalDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(CATCH_STORE_NAME, "readwrite");
    transaction.objectStore(CATCH_STORE_NAME).put({ id: "legacy-catch", scopeKey: "guest:legacy" });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  assert.equal(await hasLegacyProfileData("guest:legacy"), true);
  assert.equal(await hasLegacyProfileData("guest:empty"), false);
});

test("an existing scoped Water also bypasses first-run onboarding", async () => {
  const scope = { scopeKey: "guest:water-profile", ownerId: null };
  await waterRepository.put({ id: "water-only", name: "Lipno" }, scope);
  assert.equal(await hasLegacyProfileData(scope.scopeKey), true);
  assert.equal(await hasLegacyProfileData("guest:empty-water-profile"), false);
});
