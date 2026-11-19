import { PROFILE_SECTIONS } from "./publicProfileModel.js";

const sectionDefaults = visibility => Object.fromEntries(PROFILE_SECTIONS.map(key => [key, visibility]));

export const hasPublicPublicationConsent = receipt => receipt?.version === 1 && receipt.mode === "public";
export const canShareWithAudience = (receipt, visibility) => visibility === "private"
  || (visibility === "friends" ? receipt?.mode !== "private" : hasPublicPublicationConsent(receipt));

export function privacyDefaultsForSharingMode(settings, receipt) {
  const visibility = hasPublicPublicationConsent(receipt) ? "public" : "private";
  return { ...settings, profileVisibility: visibility, defaultCatchVisibility: visibility,
    defaultPhotoVisibility: visibility, defaultCatchVisibilityExplicit: true,
    privateSpotDefault: true, defaultLocationPrecision: "none" };
}

export function sharingProfilePreset(profile, mode) {
  const isPublic = mode === "public";
  return { ...profile, visibility: isPublic ? "public" : "private", discoverable: isPublic,
    directoryDiscoverable: isPublic, regionDiscoverable: false, sections: sectionDefaults(isPublic ? "public" : "private"),
    // Returning to public never reselects previously private source records.
    sharedCatchIds: [], sharedPhotos: [], sharedAchievementIds: [] };
}

export function editableProfile(profile, { newProfile = false } = {}) {
  const publicDefaults = !profile && newProfile;
  return { handle: profile?.handle ?? "", displayName: profile?.displayName ?? "", bio: profile?.bio ?? "", region: profile?.region ?? "", specialization: profile?.specialization ?? "", favoriteSpecies: profile?.favoriteSpecies ?? "",
    visibility: profile?.visibility ?? (publicDefaults ? "public" : "private"), discoverable: profile?.discoverable ?? publicDefaults, directoryDiscoverable: profile?.directoryDiscoverable ?? publicDefaults, regionDiscoverable: profile?.regionDiscoverable === true,
    sections: { ...sectionDefaults(publicDefaults ? "public" : "private"), ...profile?.sections }, sharedCatchIds: profile?.sharedCatchIds ?? [], sharedPhotos: profile?.sharedPhotos ?? [], sharedAchievementIds: profile?.sharedAchievementIds ?? [] };
}

export function requiresProfilePublicConsent(next, current) {
  return next.visibility === "public" && current?.visibility !== "public"
    || Object.entries(next.sections).some(([key, value]) => value === "public" && current?.sections?.[key] !== "public");
}
