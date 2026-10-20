export function resolveHomeEntry({
  scopeReady,
  dataLoaded,
  onboardingComplete,
  hasReadError,
  hasLegacyRecords,
  legacyCheckComplete,
  legacyDataFound,
}) {
  if (scopeReady && onboardingComplete) return "home";
  if (hasReadError || hasLegacyRecords || (scopeReady && legacyCheckComplete && legacyDataFound)) return "home";
  if (scopeReady && dataLoaded && legacyCheckComplete && legacyDataFound === false) return "onboarding";
  return "loading";
}
