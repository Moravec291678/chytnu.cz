import { createHash, randomUUID } from "node:crypto";
export function createSocialPhotoCoordinator({ db, photo, now = () => Date.now() }) {
  return { async prepare(identity, source) {
    const key = createHash("sha256").update(JSON.stringify([identity.uid,identity.catchId,identity.photoId,source.cloud?.sha256])).digest("hex");
    const ref = db.doc(`users/${identity.uid}/socialMediaReceipts/${key}`), lease = randomUUID();
    const cached = await db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data();
      const [deleting,suspended,parent,current]=await Promise.all([`accountDeletions/${identity.uid}`,`accountSuspensions/${identity.uid}`,
        `users/${identity.uid}/catches/${identity.catchId}`,`users/${identity.uid}/catches/${identity.catchId}/photos/${identity.photoId}`].map(p=>tx.get(db.doc(p))));
      if (deleting.exists || suspended.exists || parent.data()?.ownerId !== identity.uid || parent.data()?.deleted
        || current.data()?.ownerId !== identity.uid || current.data()?.deleted || current.data()?.cloud?.sha256 !== source.cloud?.sha256) throw new Error("post_unavailable");
      if (row?.receipt) return row.receipt;
      if (row?.retryAfter > now() || row?.leaseUntil > now()) throw new Error("photo_preparing");
      const day=Math.floor(now()/86400000),limits=[["social-media-day",30],[`social-media-${createHash("sha256").update(identity.uid).digest("hex")}`,10]];
      const counters=await Promise.all(limits.map(([id])=>tx.get(db.doc(`serverRateLimits/${id}`))));
      const counts=counters.map(r=>r.data()?.window===day?r.data().count:0);
      if (counts.some((count,i)=>!Number.isSafeInteger(count)||count<0||count>=limits[i][1])) throw new Error("request_limit");
      limits.forEach(([id],i)=>tx.set(db.doc(`serverRateLimits/${id}`),{window:day,count:counts[i]+1}));
      tx.set(ref, { lease, leaseUntil: now()+120_000, createdAt: row?.createdAt ?? now() }); return null;
    });
    if (cached) return cached;
    try {
      const receipt = await photo.prepare(identity, source);
      await db.runTransaction(async tx => {
        const row = (await tx.get(ref)).data();
        const deleted = await tx.get(db.doc(`accountDeletions/${identity.uid}`));
        if (deleted.exists || row?.lease !== lease || row.leaseUntil <= now()) throw new Error("photo_preparing");
        tx.set(ref, { receipt, createdAt: row.createdAt, leaseUntil: 0 });
      });
      return receipt;
    } catch (error) {
      await db.runTransaction(async tx => {
        const row = (await tx.get(ref)).data();
        const deleting=await tx.get(db.doc(`accountDeletions/${identity.uid}`));
        // Account cleanup may already have removed this record. Never resurrect it.
        if (deleting.exists) { if (row) tx.delete(ref); }
        else if (row?.lease === lease) tx.set(ref, { createdAt: row.createdAt, leaseUntil: 0, retryAfter: now()+3600_000 });
      });
      throw error;
    }
  }, delivery: (identity, source, receipt) => photo.delivery(identity,source,receipt) };
}
