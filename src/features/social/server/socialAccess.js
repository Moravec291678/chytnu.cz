import { canonicalPair, socialUid } from "../data/socialModel.js";
// Photo ownership is encoded in its trusted Firestore path and owned parent.
// Production photo documents intentionally have no client-editable ownerId.
export function activeSocialPhoto(parent, photo, uid, photoId) {
  const attached=parent?.photoRefs && typeof parent.photoRefs === "object" ? parent.photoRefs[photoId] === true
    : Array.isArray(parent?.photoIds) ? parent.photoIds.includes(photoId)
    : Array.isArray(parent?.photos) && parent.photos.some(p=>p?.id === photoId);
  return !!(parent?.ownerId === uid && !parent.deleted && attached && photo && !photo.deleted
    && (photo.id === undefined || photo.id === photoId) && (photo.ownerId === undefined || photo.ownerId === uid));
}
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
