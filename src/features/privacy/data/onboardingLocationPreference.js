const LOCATION_MODES = new Set(["exact", "approximate", "none"]);

export function getOnboardingLocationMode(settings) {
  if (settings?.privateSpotDefault || !LOCATION_MODES.has(settings?.defaultLocationPrecision)) return "none";
  return settings.defaultLocationPrecision;
}

export function applyOnboardingLocationMode(settings, mode) {
  if (!LOCATION_MODES.has(mode)) throw new TypeError("Přesnost polohy není platná.");
  const noLocation = mode === "none";
  return {
    ...settings,
    defaultLocationPrecision: noLocation ? "none" : mode,
    privateSpotDefault: noLocation,
  };
}
