import { createHash } from "node:crypto";
import { REACTION_KINDS } from "../data/socialInteractionModel.js";
const count = value => {
  if (value === undefined || value === null) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("interaction_conflict");
  return value;
};
export function interactionCounts(row) {
  return { reactionCounts: Object.fromEntries(REACTION_KINDS.map(kind => [kind, count(row?.reactionCounts?.[kind])])), commentCount: count(row?.commentCount) };
}
export const interactionReferenceId = path => createHash("sha256").update(path).digest("hex");
export function changeInteractionCounts(row, { previousReaction, nextReaction, comments = 0 } = {}) {
  const result = interactionCounts(row);
  if (REACTION_KINDS.includes(previousReaction)) result.reactionCounts[previousReaction] = Math.max(0, result.reactionCounts[previousReaction] - 1);
  if (REACTION_KINDS.includes(nextReaction)) result.reactionCounts[nextReaction]++;
  result.commentCount = Math.max(0, result.commentCount + comments);
  if ([result.commentCount, ...Object.values(result.reactionCounts)].some(value => !Number.isSafeInteger(value))) throw new Error("interaction_conflict");
  return result;
}
export async function cleanupInteractionReference({ db, tx, path, uid, manifestRef }) {
  if (typeof path !== "string" || !path.startsWith("socialPosts/")) return false;
  const match = /^socialPosts\/([A-Za-z0-9_-]{1,128})\/(reactions|comments)\/([A-Za-z0-9_-]{1,128})$/.exec(path);
  if (!match || match[2] === "reactions" && match[3] !== uid) throw new Error("invalid_social_cleanup_reference");
  const work = async transaction => {
    const parentRef = db.doc(`socialPosts/${match[1]}`), childRef = db.doc(path);
    const [parent, child] = await Promise.all([transaction.get(parentRef), transaction.get(childRef)]);
    const row = child.data();
    if (child.exists && row.ownerUid !== uid) throw new Error("invalid_social_cleanup_owner");
    if (parent.exists && child.exists && !row.deleted && row.moderationState !== "hidden") {
      transaction.update(parentRef, changeInteractionCounts(parent.data(), match[2] === "reactions" ? { previousReaction: row.kind } : { comments: -1 }));
    }
    transaction.delete(childRef);
    transaction.delete(manifestRef ?? db.doc(`users/${uid}/socialReferences/${interactionReferenceId(path)}`));
    return true;
  };
  return tx ? work(tx) : db.runTransaction(work);
}
