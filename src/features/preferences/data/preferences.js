const KEY = "chytnu:preferences:v1";
import { NOTIFICATION_PREFERENCES } from "../../../product/config/notifications.js";

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze(Object.fromEntries(
  NOTIFICATION_PREFERENCES.map(({ key, defaultEnabled }) => [key, defaultEnabled]),
));

export const DEFAULT_PREFERENCES = Object.freeze({
  detailMode: "simple",
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  onboardingComplete: false,
});

function preferenceKey(scopeKey) {
  return scopeKey ? `${KEY}:${scopeKey}` : KEY;
}

function booleanOrFallback(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNotificationPreferences(saved = {}) {
  const legacyStreaksAndChallenges = typeof saved.challenges === "boolean"
    ? saved.challenges
    : saved.streak;

  return {
    morningFishActivity: booleanOrFallback(
      saved.morningFishActivity,
      booleanOrFallback(saved.fishActivity, DEFAULT_NOTIFICATION_PREFERENCES.morningFishActivity),
    ),
    tomorrowGreatConditions: booleanOrFallback(
      saved.tomorrowGreatConditions,
      booleanOrFallback(saved.weather, DEFAULT_NOTIFICATION_PREFERENCES.tomorrowGreatConditions),
    ),
    friendActivity: booleanOrFallback(saved.friendActivity, DEFAULT_NOTIFICATION_PREFERENCES.friendActivity),
    streaksAndChallenges: booleanOrFallback(
      saved.streaksAndChallenges,
      booleanOrFallback(legacyStreaksAndChallenges, DEFAULT_NOTIFICATION_PREFERENCES.streaksAndChallenges),
    ),
    friendLegendaryCatch: booleanOrFallback(
      saved.friendLegendaryCatch,
      DEFAULT_NOTIFICATION_PREFERENCES.friendLegendaryCatch,
    ),
  };
}

export function readPreferences(storage = globalThis.localStorage, scopeKey = null) {
  try {
    const scopedValue = storage?.getItem(preferenceKey(scopeKey));
    const rawValue = scopeKey && scopedValue === null ? storage?.getItem(KEY) : scopedValue;
    const saved = JSON.parse(rawValue || "null");
    return {
      ...DEFAULT_PREFERENCES,
      ...(saved && typeof saved === "object" ? saved : {}),
      notifications: normalizeNotificationPreferences(saved?.notifications),
    };
  } catch { return { ...DEFAULT_PREFERENCES, notifications: { ...DEFAULT_PREFERENCES.notifications } }; }
}

export function savePreferences(patch, storage = globalThis.localStorage, scopeKey = null) {
  const current = readPreferences(storage, scopeKey);
  const next = { ...current, ...patch };
  if (patch.notifications) next.notifications = { ...current.notifications, ...patch.notifications };
  try { storage?.setItem(preferenceKey(scopeKey), JSON.stringify(next)); }
  catch (error) { throw new Error(`Nastavení se nepodařilo uložit: ${error?.message || "úložiště není dostupné"}`, { cause: error }); }
  return next;
}

function onboardingKey(scopeKey) { return scopeKey ? `chytnu:onboarding:v1:${scopeKey}` : "chytnu:onboarding:v1:default"; }
const LEGACY_ONBOARDING_MIGRATED_KEY = "chytnu:onboarding:v1:migrated-global";

export function isOnboardingComplete(scopeKey, storage = globalThis.localStorage) {
  try {
    if (scopeKey) {
      if (storage?.getItem(onboardingKey(scopeKey)) === "true") return true;
      if (storage?.getItem(LEGACY_ONBOARDING_MIGRATED_KEY) !== "true" && readPreferences(storage).onboardingComplete === true) {
        storage?.setItem(onboardingKey(scopeKey), "true");
        storage?.setItem(LEGACY_ONBOARDING_MIGRATED_KEY, "true");
        return true;
      }
      return false;
    }
    return readPreferences(storage).onboardingComplete === true || storage?.getItem(onboardingKey()) === "true";
  } catch { return false; }
}

export function completeOnboarding(scopeKey, storage = globalThis.localStorage) {
  try { storage?.setItem(onboardingKey(scopeKey), "true"); }
  catch (error) { throw new Error("Dokončení úvodního nastavení se nepodařilo uložit.", { cause: error }); }
}
