import { canonicalPair, socialUid } from "../data/socialModel.js";
// One server boundary for future messages, friends feeds and existing profiles.
export async function assertSocialInteraction({ tx, db, uid, targetUid, requireFriend = false }) {
  socialUid(uid); socialUid(targetUid);
  const paths = [`socialBlocks/${uid}/blocked/${targetUid}`, `socialBlocks/${targetUid}/blocked/${uid}`,
    `accountSuspensions/${uid}`, `accountDeletions/${uid}`, `accountSuspensions/${targetUid}`, `accountDeletions/${targetUid}`];
  if ((await Promise.all(paths.map(path => tx.get(db.doc(path))))).some(row => row.exists)) throw new Error("social_unavailable");
  if (requireFriend) {
    const relation = (await tx.get(db.doc(`socialRelationships/${canonicalPair(uid, targetUid)}`))).data();
    if (relation?.status !== "accepted" || !relation.memberUids?.includes(uid) || !relation.memberUids.includes(targetUid)) throw new Error("social_unavailable");
  }
}
