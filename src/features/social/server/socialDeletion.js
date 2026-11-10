// Executed before the existing private-data phase removes users/{uid}.
// Nested future content must register its canonical path in the private manifest.
export async function deleteSocialPage(db, uid, pageSize = 50) {
  const manifest = await db.collection(`users/${uid}/socialReferences`).limit(pageSize).get();
  for (const entry of manifest.docs) {
    const path = entry.data().path;
    // Never let a malformed manifest target the diary, configuration or credentials.
    if (typeof path !== "string" || !/^(socialPosts\/[^/]+\/(comments|reactions)\/[^/]+|waterRooms\/ris-[a-f0-9]{24}\/messages\/[^/]+)$/.test(path)) throw new Error("invalid_social_cleanup_reference");
    const ref = db.doc(path), record = await ref.get();
    if (record.exists && record.data().ownerUid !== uid) throw new Error("invalid_social_cleanup_owner");
    await db.recursiveDelete(ref); await entry.ref.delete();
  }
  if (manifest.size) return true;
  for (const [collection, field, op] of [["publicHandles", "uid", "=="], ["socialRelationships", "memberUids", "array-contains"],
    ["socialPosts", "ownerUid", "=="], ["nearbyPresence", "ownerUid", "=="], ["waterPresence", "ownerUid", "=="],
    ["privateConversations", "memberUids", "array-contains"], ["crews", "ownerUid", "=="]]) {
    const page = await db.collection(collection).where(field, op, uid).limit(pageSize).get();
    for (const entry of page.docs) await db.recursiveDelete(entry.ref);
    if (page.size) return true;
  }
  // A former member must not remain discoverable in another user's crew.
  const memberships = await db.collection("crews").where("memberUids", "array-contains", uid).limit(pageSize).get();
  for (const entry of memberships.docs) await db.runTransaction(async tx => {
    const current = await tx.get(entry.ref);
    if (current.exists) tx.update(entry.ref, { memberUids: current.data().memberUids.filter(member => member !== uid) });
  });
  if (memberships.size) return true;
  // Incoming blocks are retained as minimal anti-abuse tombstones until their
  // authors unblock/delete; they contain no profile, handle, GPS or content.
  await db.recursiveDelete(db.doc(`socialBlocks/${uid}`));
  await db.doc(`publicProfiles/${uid}`).delete();
  return false;
}
