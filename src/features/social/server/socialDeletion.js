import { cleanupInteractionReference } from "./socialInteractionCounters.js";

// Executed before the existing private-data phase removes users/{uid}.
// Nested future content must register its canonical path in the private manifest.
export async function deleteSocialPage(db, uid, pageSize = 50, deleteAvatar) {
  const manifest = await db.collection(`users/${uid}/socialReferences`).limit(pageSize).get();
  for (const entry of manifest.docs) {
    const path = entry.data().path;
    // Never let a malformed manifest target the diary, configuration or credentials.
    if (typeof path !== "string" || !/^(socialPosts\/[^/]+\/(comments|reactions)\/[^/]+|waterRooms\/ris-[a-f0-9]{24}\/messages\/[^/]+)$/.test(path)) throw new Error("invalid_social_cleanup_reference");
    if (await cleanupInteractionReference({ db, path, uid, manifestRef: entry.ref })) continue;
    await db.runTransaction(async tx => {
      const ref = db.doc(path);
      const record = await tx.get(ref);
      if (record.exists && record.data().ownerUid !== uid) throw new Error("invalid_social_cleanup_owner");
      tx.delete(ref);
      tx.delete(entry.ref);
    });
  }
  if (manifest.size) return true;
  for (const [collection, field, op] of [["publicHandles", "uid", "=="], ["socialRelationships", "memberUids", "array-contains"],
    ["socialReports", "reporterUid", "=="], ["socialReports", "targetUid", "=="],
    ["socialPosts", "ownerUid", "=="], ["nearbyPresence", "ownerUid", "=="], ["waterPresence", "ownerUid", "=="],
    ["privateConversations", "memberUids", "array-contains"], ["crews", "ownerUid", "=="]]) {
    const page = await db.collection(collection).where(field, op, uid).limit(pageSize).get();
    if (collection === "privateConversations" && page.size) {
      const conversation = page.docs[0].ref;
      const messages = await conversation.collection("messages").limit(pageSize).get();
      if (messages.empty) await conversation.delete();
      else {
        const batch = db.batch();
        for (const message of messages.docs) batch.delete(message.ref);
        await batch.commit();
      }
      return true;
    }
    for (const entry of page.docs) await db.recursiveDelete(entry.ref);
    if (page.size) return true;
  }
  // A former member must not remain discoverable in another user's crew.
  for (const field of ["memberUids", "inviteUids"]) {
    const memberships = await db.collection("crews").where(field, "array-contains", uid).limit(pageSize).get();
    for (const entry of memberships.docs) await db.runTransaction(async tx => {
      const current = (await tx.get(entry.ref)).data();
      if (!current || !current[field]?.includes(uid)) return;
      const update = { [field]: current[field].filter(member => member !== uid) };
      if (Array.isArray(current.moderatorUids)) update.moderatorUids = current.moderatorUids.filter(member => member !== uid);
      if (Number.isSafeInteger(current.revision)) update.revision = current.revision + 1;
      tx.update(entry.ref, update);
    });
    if (memberships.size) return true;
  }
  const profile = await db.doc(`publicProfiles/${uid}`).get();
  if (deleteAvatar && await deleteAvatar(uid, pageSize)) return true;
  if (profile.data()?.avatarVersion && !deleteAvatar) throw new Error("social_avatar_cleanup_unavailable");
  // Incoming blocks are retained as minimal anti-abuse tombstones until their
  // authors unblock/delete; they contain no profile, handle, GPS or content.
  await db.recursiveDelete(db.doc(`socialBlocks/${uid}`));
  await db.doc(`publicProfiles/${uid}`).delete();
  return false;
}
