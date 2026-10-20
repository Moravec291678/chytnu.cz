import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  completeOnboarding,
  DEFAULT_NOTIFICATION_PREFERENCES,
  isOnboardingComplete,
  readPreferences,
  savePreferences,
} from "./preferences.js";
import { hasLegacyProfileData, hasScopedRecords } from "./legacyProfile.js";
import { CATCH_STORE_NAME, openLocalDatabase } from "../../catches/data/catchRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";

function memoryStorage() { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }

test("all notification preferences persist across reload and stay isolated by profile", () => {
  const storage = memoryStorage();
  const selected = {
    morningFishActivity: false,
    tomorrowGreatConditions: true,
    friendActivity: true,
    streaksAndChallenges: false,
    friendLegendaryCatch: true,
  };
  savePreferences({ detailMode: "detailed", notifications: selected }, storage, "guest-a");
  const loaded = readPreferences(storage, "guest-a");
  assert.equal(loaded.detailMode, "detailed");
  assert.deepEqual(loaded.notifications, selected);
  assert.deepEqual(readPreferences(storage, "guest-b").notifications, DEFAULT_NOTIFICATION_PREFERENCES);
});

test("legacy notification choices migrate to the current preference names", () => {
  const storage = memoryStorage();
  storage.setItem("chytnu:preferences:v1:guest-legacy", JSON.stringify({
    notifications: { fishActivity: false, weather: true, challenges: false },
  }));

  assert.deepEqual(readPreferences(storage, "guest-legacy").notifications, {
    morningFishActivity: false,
    tomorrowGreatConditions: true,
    friendActivity: false,
    streaksAndChallenges: false,
    friendLegendaryCatch: false,
  });
});

test("entry mode persists independently per profile and uses the legacy value only as a fallback", () => {
  const storage = memoryStorage();
  savePreferences({ detailMode: "detailed" }, storage);
  assert.equal(readPreferences(storage, "guest-new").detailMode, "detailed");

  savePreferences({ detailMode: "simple" }, storage, "guest-a");
  savePreferences({ detailMode: "detailed" }, storage, "account-b");

  assert.equal(readPreferences(storage, "guest-a").detailMode, "simple");
  assert.equal(readPreferences(storage, "account-b").detailMode, "detailed");
  assert.equal(readPreferences(storage, "guest-new").detailMode, "detailed");
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
