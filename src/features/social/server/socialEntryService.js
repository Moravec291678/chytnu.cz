import { createHash } from "node:crypto";
import { socialUid } from "../data/socialModel.js";
import { selectedPublicAchievements } from "../data/publicProgressionModel.js";
import { publicProgressionFromSummary } from "./publicProgressionService.js";
import { publicationConsentPath, assertPublicationConsent } from "./publicationConsent.js";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const kinds = ["experience", "achievement", "milestone"];
const fail = (code = "invalid_publication") => { throw new Error(code); };
const text = (value, max, required = false) => typeof value === "string" && value.length <= max && (!required || value.trim().length > 0)
  && !Array.from(value).some(c => c.charCodeAt(0) < 32 && !["\n", "\r", "\t"].includes(c));
// Firestore maps need not retain JavaScript insertion order. These canonical
// DTOs contain primitives only; require the exact key set and values.
const sameDto = (actual, expected) => !!actual && typeof actual === "object" && !Array.isArray(actual)
  && Object.keys(actual).length === Object.keys(expected).length
  && Object.keys(expected).every(key => Object.hasOwn(actual, key) && actual[key] === expected[key]);
export function socialEntryId(uid, entryId) {
  socialUid(uid); if (typeof entryId !== "string" || !UUID.test(entryId)) fail();
  return createHash("sha256").update(`social-entry-v1/${uid}/${entryId}`).digest("hex");
}
export const socialEntrySection = kind => ["achievement", "milestone"].includes(kind) ? "achievements" : "catches";

export function createSocialEntryService({ db, guard, now = () => Date.now() }) {
  const authorize = guard ?? (async (tx, uid) => {
    const [config, suspended, deleting] = await Promise.all(["adminConfig/social", `accountSuspensions/${uid}`, `accountDeletions/${uid}`].map(path => tx.get(db.doc(path))));
    if (config.data()?.profilesEnabled === false || config.data()?.postsEnabled === false) fail("social_disabled");
    if (suspended.exists || deleting.exists) fail("account_unavailable");
  });
  async function progression(tx, uid) {
    return publicProgressionFromSummary((await tx.get(db.doc(`users/${uid}/serverProgressionState/summary`))).data(), uid);
  }
  async function approved({ tx, profile, row }) {
    if (!profile || profile.uid !== row?.ownerUid || !kinds.includes(row.kind) || row.deleted || row.moderationState !== "visible") return false;
    if (!text(row.content?.title, 100, true) || !text(row.content?.description, 1000, true)) return false;
    if (row.kind === "experience") return true;
    if (row.kind === "achievement") {
      const achievement = selectedPublicAchievements(profile.sharedAchievementIds).find(item => item.id === row.content?.achievement?.id);
      return !!achievement && sameDto(row.content.achievement, achievement);
    }
    const current = await progression(tx, row.ownerUid), snapshot = row.content?.progression;
    if (!current || !snapshot || !Number.isSafeInteger(snapshot.xp) || snapshot.xp <= 0 || current.xp < snapshot.xp) return false;
    const expected = publicProgressionFromSummary({ ownerId: row.ownerUid, serverEventXp: snapshot.xp }, row.ownerUid);
    return sameDto(snapshot, expected);
  }
  return {
    approved,
    async save(uid, input) {
      socialUid(uid);
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["entryId", "kind", "visibility", "expectedRevision", "title", "description", "achievementId"].includes(key))
        || !kinds.includes(input.kind) || !["private", "friends", "public"].includes(input.visibility)
        || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
        || !text(input.description, 1000, true) || input.title !== undefined && !text(input.title, 100)
        || input.kind === "achievement" && typeof input.achievementId !== "string"
        || input.kind !== "achievement" && input.achievementId !== undefined) fail();
      const id = socialEntryId(uid, input.entryId), ref = db.doc(`socialPosts/${id}`);
      return db.runTransaction(async tx => {
        await authorize(tx, uid);
        const [savedProfile, stored] = await Promise.all([`publicProfiles/${uid}`, `socialPosts/${id}`].map(path => tx.get(db.doc(path))));
        const profile = savedProfile.data(), old = stored.data();
        if (profile?.uid !== uid) fail("save_profile_first");
        const consent = (await tx.get(db.doc(publicationConsentPath(uid)))).data();
        assertPublicationConsent(consent, input.visibility);
        if ((old?.revision ?? 0) !== input.expectedRevision || old && (old.ownerUid !== uid || old.sourceEntryId !== input.entryId || old.kind !== input.kind)) fail("post_conflict");
        const content = { title: input.title?.trim() || "Zážitek od vody", description: input.description.trim() };
        if (input.kind === "achievement") {
          const achievement = selectedPublicAchievements(profile.sharedAchievementIds).find(item => item.id === input.achievementId);
          if (!achievement) fail("post_unavailable");
          content.title = achievement.title; content.achievement = achievement;
        } else if (input.kind === "milestone") {
          const snapshot = await progression(tx, uid);
          if (!snapshot || snapshot.xp <= 0) fail("post_unavailable");
          content.title = `Milník: úroveň ${snapshot.level}`; content.progression = snapshot;
        }
        const row = { id, ownerUid: uid, kind: input.kind, sourceEntryId: input.entryId, content, visibility: input.visibility, publicationEpoch:consent?.epoch ?? 0,
          revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? now(), updatedAt: now(), deleted: false,
          moderationState: old?.moderationState ?? "visible", schemaVersion: 1 };
        tx.set(ref, row);
        return { row, profile, audience: "owner" };
      });
    },
  };
}
