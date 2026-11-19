import { PROFILE_SECTIONS } from "./publicProfileModel.js";

const sectionDefaults = Object.fromEntries(PROFILE_SECTIONS.map(key => [key, "private"]));

export function editableProfile(profile, { newProfile = false } = {}) {
  return { handle: profile?.handle ?? "", displayName: profile?.displayName ?? "", bio: profile?.bio ?? "", region: profile?.region ?? "", specialization: profile?.specialization ?? "", favoriteSpecies: profile?.favoriteSpecies ?? "",
    visibility: profile?.visibility ?? (newProfile ? "public" : "private"), discoverable: profile?.discoverable === true, directoryDiscoverable: profile?.directoryDiscoverable === true, regionDiscoverable: profile?.regionDiscoverable === true,
    sections: { ...sectionDefaults, ...profile?.sections }, sharedCatchIds: profile?.sharedCatchIds ?? [], sharedPhotos: profile?.sharedPhotos ?? [], sharedAchievementIds: profile?.sharedAchievementIds ?? [] };
}

export function requiresProfilePublicConsent(next, current) {
  return next.visibility === "public" && current?.visibility !== "public"
    || Object.entries(next.sections).some(([key, value]) => value === "public" && current?.sections?.[key] !== "public");
}
