const KEY = "chytnu:preferences:v1";
export const DEFAULT_PREFERENCES = Object.freeze({
  detailMode: "simple",
  notifications: Object.freeze({ fishActivity: true, challenges: true, streak: true, weeklySummary: true, weather: false }),
  onboardingComplete: false,
});

export function readPreferences(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || "null");
    return {
      ...DEFAULT_PREFERENCES,
      ...(saved && typeof saved === "object" ? saved : {}),
      notifications: { ...DEFAULT_PREFERENCES.notifications, ...(saved?.notifications || {}) },
    };
  } catch { return { ...DEFAULT_PREFERENCES, notifications: { ...DEFAULT_PREFERENCES.notifications } }; }
}

export function savePreferences(patch, storage = globalThis.localStorage) {
  const current = readPreferences(storage);
  const next = { ...current, ...patch };
  if (patch.notifications) next.notifications = { ...current.notifications, ...patch.notifications };
  try { storage?.setItem(KEY, JSON.stringify(next)); }
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
