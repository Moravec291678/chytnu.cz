import { ACHIEVEMENT_DEFINITIONS } from "../../../product/config/achievements.js";

export const PUBLIC_PROGRESSION_VERSION = 1;
export const MAX_SHARED_ACHIEVEMENTS = 12;
// Hidden definitions remain absent until an authoritative achievement issuer
// exists. An editable ID is never proof that a hidden achievement was unlocked.
const available = ACHIEVEMENT_DEFINITIONS.filter(item => item.hidden !== true);
const definitions = new Map(available.map(item => [item.id, item]));
const achievementDto = item => ({ version: PUBLIC_PROGRESSION_VERSION, id: item.id, title: item.name,
  description: item.description, category: item.category, xp: item.xp,
  source: "unverified", verified: false, unlockedAt: null, rewardGranted: false });

export function validSharedAchievementIds(value) {
  return Array.isArray(value) && value.length <= MAX_SHARED_ACHIEVEMENTS && new Set(value).size === value.length
    && value.every(id => typeof id === "string" && definitions.has(id));
}

// Selection is an explicit owner's statement about a local ledger. All public
// labels and reward definitions come from the product catalogue, never a client.
export function publicAchievementChoices() { return available.map(achievementDto); }
export function selectedPublicAchievements(ids = []) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids)].filter(id => definitions.has(id)).slice(0, MAX_SHARED_ACHIEVEMENTS).map(id => achievementDto(definitions.get(id)));
}
