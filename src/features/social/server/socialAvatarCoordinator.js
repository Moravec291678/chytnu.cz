import { randomUUID } from "node:crypto";
import { socialUid } from "../data/socialModel.js";

const LEASE_MS = 120_000;
const validAsset = value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
const failure = () => Object.assign(new Error("avatar_unavailable"), { code: "avatar_unavailable", status: 503 });
const unavailable = () => Object.assign(new Error("account_unavailable"), { code: "account_unavailable", status: 403 });
const checkRevision = profile => {
  const revision = profile.avatarRevision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw failure();
  if (profile.avatarAssetId !== undefined && !validAsset(profile.avatarAssetId)) throw failure();
  return revision;
};

// A durable intent is committed before provider upload. Each operation owns an
// immutable asset, so losing a CAS or retrying cleanup can never delete a newer
// avatar. No provider call occurs inside a Firestore transaction.
export function createAvatarCoordinator({ db, avatar, now = () => Date.now() }) {
  const jobRef = assetId => db.doc(`socialAvatarJobs/${assetId}`);
  async function account(tx, uid) {
    const [profile, suspended, deletion] = await Promise.all([
      tx.get(db.doc(`publicProfiles/${uid}`)), tx.get(db.doc(`accountSuspensions/${uid}`)), tx.get(db.doc(`accountDeletions/${uid}`)),
    ]);
    if (!profile.exists || suspended.exists || deletion.exists) throw unavailable();
    const data = profile.data();
    if (data.uid !== uid) throw failure();
    checkRevision(data);
    return { ref: profile.ref, data };
  }
  async function destroyJob(ref, job) {
    socialUid(job.ownerUid);
    if (!validAsset(job.assetId) || ref.id !== job.assetId || !["pending", "attached", "delete"].includes(job.status)) throw failure();
    await avatar.remove(job.ownerUid, job.assetId);
    await ref.delete();
  }
  async function drainPage(page, { accountDeletion = false } = {}) {
    let waiting = false;
    for (const snapshot of page.docs) {
      const job = snapshot.data();
      if (job.status === "pending" && job.leaseUntil > now() || job.status === "delete" && job.leaseUntil > now()) { waiting = true; continue; }
      if (!accountDeletion && job.status === "attached") continue;
      // Once an uploader's lease expires it can no longer attach this asset.
      // Claiming cleanup as delete is atomic with that attach check.
      const claimed = await db.runTransaction(async tx => {
        const current = await tx.get(snapshot.ref);
        if (!current.exists) return null;
        const value = current.data();
        if (value.status === "pending" && value.leaseUntil > now() || value.status === "delete" && value.leaseUntil > now()
          || !accountDeletion && value.status === "attached") return null;
        tx.set(snapshot.ref, { ...value, status: "delete", leaseUntil: 0 });
        return { ...value, status: "delete" };
      });
      if (claimed) await destroyJob(snapshot.ref, claimed);
    }
    return waiting || page.size > 0;
  }
  return Object.freeze({
    async save(uid, bytes) {
      socialUid(uid);
      const assetId = randomUUID().replaceAll("-", ""), ref = jobRef(assetId), createdAt = now();
      const expected = await db.runTransaction(async tx => {
        const profile = await account(tx, uid);
        tx.create(ref, { ownerUid: uid, assetId, status: "pending", leaseUntil: createdAt + LEASE_MS, createdAt });
        return { revision: checkRevision(profile.data), oldAssetId: profile.data.avatarAssetId };
      });
      let uploaded = null;
      try {
        uploaded = await avatar.save(uid, bytes, assetId);
        await db.runTransaction(async tx => {
          const [profile, job] = await Promise.all([account(tx, uid), tx.get(ref)]);
          const oldRef = expected.oldAssetId ? jobRef(expected.oldAssetId) : null;
          const oldJob = oldRef ? await tx.get(oldRef) : null;
          if (checkRevision(profile.data) !== expected.revision || job.data()?.status !== "pending"
            || job.data()?.ownerUid !== uid || job.data()?.leaseUntil <= now()) throw failure();
          tx.set(profile.ref, { ...profile.data, avatarVersion: uploaded.version, avatarAssetId: assetId,
            avatarRevision: expected.revision + 1, updatedAt: now() });
          tx.set(ref, { ...job.data(), status: "attached", leaseUntil: 0 });
          if (oldRef) tx.set(oldRef, { ...(oldJob?.data() ?? {}), ownerUid: uid, assetId: expected.oldAssetId, status: "delete", leaseUntil: 0, createdAt: oldJob?.data()?.createdAt ?? now() });
        });
      } catch (error) {
        // A failed provider response may still finish remotely. Preserve its
        // lease before cron cleanup; completed uploads can be removed at once.
        const job = { ownerUid: uid, assetId, status: "delete", leaseUntil: uploaded ? 0 : createdAt + LEASE_MS, createdAt };
        await ref.set(job);
        if (uploaded) { try { await destroyJob(ref, job); } catch { /* Durable job retries via cron/account deletion. */ } }
        throw error;
      }
      // The new asset is already attached. A failure deleting the previous
      // immutable asset must never turn this successful replacement into an
      // error or remove the new asset; its durable job remains for cron retry.
      if (expected.oldAssetId) {
        const previousRef = jobRef(expected.oldAssetId);
        try {
          const previous = await previousRef.get();
          if (previous.exists && previous.data().status === "delete" && previous.data().ownerUid === uid) await destroyJob(previousRef, previous.data());
        } catch { /* The previous asset's committed deletion job is retryable. */ }
      }
      return { version: uploaded.version, assetId };
    },
    async remove(uid) {
      socialUid(uid);
      const old = await db.runTransaction(async tx => {
        const profile = await account(tx, uid), revision = checkRevision(profile.data);
        const assetId = profile.data.avatarAssetId;
        const ref = assetId ? jobRef(assetId) : null, current = ref ? await tx.get(ref) : null;
        const data = { ...profile.data, avatarRevision: revision + 1, updatedAt: now() };
        delete data.avatarAssetId; delete data.avatarVersion;
        tx.set(profile.ref, data);
        const job = ref ? { ...(current?.data() ?? {}), ownerUid: uid, assetId, status: "delete", leaseUntil: 0, createdAt: current?.data()?.createdAt ?? now() } : null;
        if (ref) tx.set(ref, job);
        return ref ? { ref, job } : null;
      });
      if (old) { try { await destroyJob(old.ref, old.job); } catch { /* Durable cleanup remains queued. */ } }
    },
    async cleanup(uid, pageSize = 20) {
      socialUid(uid);
      const page = await db.collection("socialAvatarJobs").where("ownerUid", "==", uid).limit(Math.max(1, Math.min(20, pageSize))).get();
      return drainPage(page, { accountDeletion: true });
    },
    async cleanupPending() {
      let processed = 0;
      for (const status of ["delete", "pending"]) {
        const page = await db.collection("socialAvatarJobs").where("status", "==", status).limit(100 - processed).get();
        await drainPage(page); processed += page.size;
        if (processed >= 100) break;
      }
      return processed;
    },
  });
}
