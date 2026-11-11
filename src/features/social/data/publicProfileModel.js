import { normalizedHandle, validateSocialRecord } from "./socialModel.js";
import { validSharedAchievementIds } from "./publicProgressionModel.js";
export const PROFILE_SECTIONS = ["interests", "statistics", "catches", "gallery", "achievements", "trophies"];
const visibility = value => ["private", "friends", "public"].includes(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const text = (value, max) => typeof value === "string" && value.length <= max && !Array.from(value).some(c => c.charCodeAt(0) < 32);
const keys = ["handle", "displayName", "bio", "region", "specialization", "favoriteSpecies", "visibility", "discoverable", "directoryDiscoverable", "regionDiscoverable", "sections", "sharedCatchIds", "sharedPhotos", "sharedAchievementIds"];
export function validateProfileInput(input) {
  if (!input || Array.isArray(input) || Object.keys(input).some(k => !keys.includes(k))) throw new TypeError("invalid_profile");
  const result = { handle: normalizedHandle(input.handle), displayName: input.displayName, bio: input.bio ?? "", visibility: input.visibility ?? "private",
    region: input.region ?? "", specialization: input.specialization ?? "", favoriteSpecies: input.favoriteSpecies ?? "", discoverable: input.discoverable ?? false,
    directoryDiscoverable: input.directoryDiscoverable ?? false, regionDiscoverable: input.regionDiscoverable ?? false,
    sections: Object.fromEntries(PROFILE_SECTIONS.map(k => [k, input.sections?.[k] ?? "private"])), sharedCatchIds: input.sharedCatchIds ?? [], sharedPhotos: input.sharedPhotos ?? [],sharedAchievementIds:input.sharedAchievementIds ?? [] };
  if (!text(result.displayName, 60) || !result.displayName.trim() || typeof result.bio !== "string" || !text(result.bio.replace(/[\r\n]/g, " "), 280) || !text(result.region, 80)
    || !text(result.specialization, 160) || !text(result.favoriteSpecies, 160) || !visibility(result.visibility) || typeof result.discoverable !== "boolean"
    || typeof result.directoryDiscoverable !== "boolean" || typeof result.regionDiscoverable !== "boolean"
    || (input.sections !== undefined && (!input.sections || Array.isArray(input.sections) || typeof input.sections !== "object" || Object.keys(input.sections).some(k => !PROFILE_SECTIONS.includes(k))))
    || Object.values(result.sections).some(v => !visibility(v)) || !Array.isArray(result.sharedCatchIds) || result.sharedCatchIds.length > 12
    || !result.sharedCatchIds.every(id) || new Set(result.sharedCatchIds).size !== result.sharedCatchIds.length
    || !Array.isArray(result.sharedPhotos) || result.sharedPhotos.length > 6 || result.sharedPhotos.some(p => !p || Object.keys(p).some(k => !["catchId", "photoId"].includes(k)) || !id(p.catchId) || !id(p.photoId))
    || new Set(result.sharedPhotos.map(p => `${p.catchId}/${p.photoId}`)).size !== result.sharedPhotos.length || !validSharedAchievementIds(result.sharedAchievementIds)) throw new TypeError("invalid_profile");
  return structuredClone(result);
}
export function validateStoredProfile(data, now = Date.now()) {
  const base = Object.fromEntries(["uid", "handle", "displayName", "bio", "visibility", "createdAt", "updatedAt"].filter(k => data[k] !== undefined).map(k => [k, data[k]]));
  if (typeof base.bio === "string") base.bio = base.bio.replace(/[\r\n]/g, " ");
  validateSocialRecord("profile", base, { now });
  const editable = Object.fromEntries(keys.filter(k => data[k] !== undefined).map(k => [k, data[k]]));
  return { ...validateProfileInput(editable), uid: data.uid, createdAt: data.createdAt, updatedAt: data.updatedAt,
    shareApprovals: data.shareApprovals && typeof data.shareApprovals === "object" && !Array.isArray(data.shareApprovals)
      ? Object.fromEntries(Object.entries(data.shareApprovals).filter(([key,value])=>/^[A-Za-z0-9_-]{1,128}(\/[A-Za-z0-9_-]{1,128})?$/.test(key) && /^[a-f0-9]{64}$/.test(value)).slice(0,18)) : {},
    ...(typeof data.avatarVersion === "string" && /^[0-9]{1,20}$/.test(data.avatarVersion) && /^[a-f0-9]{32}$/.test(data.avatarAssetId ?? "") ? { avatarVersion: data.avatarVersion, avatarAssetId: data.avatarAssetId } : {}),
    avatarRevision: Number.isSafeInteger(data.avatarRevision) && data.avatarRevision >= 0 ? data.avatarRevision : 0 };
}
export function sectionAllowed(value, audience) {
  return audience === "owner" || value === "public" || (audience === "friend" && value === "friends");
}
// Explicit DTO: never spread a private Catch or profile storage record.
export function publicCatchProjection(record) {
  if (!record || record.deleted || typeof record.species !== "string" || !record.species.trim()) return null;
  return { id: record.id, species: record.species.slice(0, 100),
    lengthCm: typeof record.lengthCm === "number" && record.lengthCm > 0 && record.lengthCm <= 500 ? record.lengthCm : null,
    caughtAt: typeof record.caughtAt === "string" && Number.isFinite(Date.parse(record.caughtAt)) ? record.caughtAt.slice(0, 10) : null };
}
