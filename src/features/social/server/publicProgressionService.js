import { summaryForXp } from "../../progression/data/progressionSummary.js";
import { sectionAllowed } from "../data/publicProfileModel.js";
import { PUBLIC_PROGRESSION_VERSION, selectedPublicAchievements } from "../data/publicProgressionModel.js";

export function publicProgressionFromSummary(summary, uid) {
  if (typeof uid !== "string" || !uid || !summary || summary.ownerId !== uid || !Number.isSafeInteger(summary.serverEventXp) || summary.serverEventXp < 0) return null;
  const { xp, level, rank } = summaryForXp(summary.serverEventXp);
  return { version: PUBLIC_PROGRESSION_VERSION, xp, level, rank: rank.name, source: "server", scope: "server-events-only", verified: true };
}

/**
 * Read-only projection of existing authoritative accounting. Local/imported XP
 * and private achievement ledgers are not public authority and are never added
 * to this XP total. Publishing cannot award, revoke or rewrite historical XP.
 * The caller must already authorize the profile (blocking/deletion/friendship).
 */
export async function projectPublicProgression({ tx, db, profile, audience, summaryOnly = false }) {
  if (!sectionAllowed(profile.sections?.achievements ?? "private", audience)) return {};
  const summary = (await tx.get(db.doc(`users/${profile.uid}/serverProgressionState/summary`))).data();
  const progression = publicProgressionFromSummary(summary, profile.uid);
  return { ...(progression ? { progression } : {}), ...(!summaryOnly ? { achievements: selectedPublicAchievements(profile.sharedAchievementIds) } : {}) };
}
