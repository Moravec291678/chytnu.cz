import { createHash } from "node:crypto";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
// Let an already signed upload finish or expire, then use the first daily cleanup sweep.
export const PHOTO_DELETE_DELAY_MS = 60 * 60 * 1000;
export const PHOTO_DELETE_JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const PHOTO_DELETE_RECEIPT_PRUNE_MS = PHOTO_DELETE_JOB_RETENTION_MS - 24 * 60 * 60 * 1000;
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_MAX_MS = 12 * 60 * 60 * 1000;
const LEASE_MS = 15 * 60 * 1000;

function validIdentity(ownerId, catchId, photoId) {
  return typeof ownerId === "string" && ownerId.length > 0 && ownerId.length <= 128 && !ownerId.includes("/")
    && ID_PATTERN.test(catchId ?? "") && ID_PATTERN.test(photoId ?? "");
}

function readMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

function cloudinaryAssetMissing(error) {
  return error?.http_code === 404 || error?.error?.http_code === 404;
}

function identityFromPhotoPath(path) {
  const parts = String(path || "").split("/");
  if (parts.length !== 6 || parts[0] !== "users" || parts[2] !== "catches" || parts[4] !== "photos"
    || !validIdentity(parts[1], parts[3], parts[5])) return null;
  return { ownerId: parts[1], catchId: parts[3], photoId: parts[5] };
}

function identityFromJobPath(path) {
  const parts = String(path || "").split("/");
  if (parts.length !== 4 || parts[0] !== "users" || parts[2] !== "photoDeletionJobs"
    || !parts[1] || parts[1].length > 128 || parts[1].includes("/") || !parts[3]) return null;
  return { ownerId: parts[1], jobId: parts[3] };
}

function jobIdFor(ownerId, catchId, photoId) {
  return createHash("sha256").update(`${ownerId}\n${catchId}\n${photoId}`).digest("hex");
}

function activeCatchReferencesPhoto(catchRecord, photoId) {
  if (!catchRecord || catchRecord.deleted === true) return false;
  return catchRecord.photoRefs?.[photoId] === true
    || (Array.isArray(catchRecord.photoIds) && catchRecord.photoIds.includes(photoId))
    || (Array.isArray(catchRecord.photos) && catchRecord.photos.some((photo) => photo?.id === photoId));
}

function validPhotoCloudLink(photo, ownerId, catchId, photoId) {
  const cloud = photo?.cloud;
  return !cloud || (cloud.provider == null && cloud.objectKey == null)
    || (cloud.provider === "cloudinary"
      && cloud.objectKey === `users/${ownerId}/catches/${catchId}/photos/${photoId}/original`);
}

export function createCloudinaryPhotoDeletionService({
  db, Timestamp, getCloudinary, derivePublicId, now = () => Date.now(), pageSize = 100,
  deleteDelayMs = PHOTO_DELETE_DELAY_MS,
} = {}) {
  if (!db || !Timestamp?.fromMillis || typeof getCloudinary !== "function" || typeof derivePublicId !== "function") {
    throw new TypeError("Cloud photo deletion dependencies are required.");
  }
  const timestamp = (value) => Timestamp.fromMillis(value);

  async function enqueue({ ownerId, catchId, photoId }) {
    if (!validIdentity(ownerId, catchId, photoId)) throw new TypeError("Invalid photo deletion identity.");
    const requestedAtMs = now();
    const id = jobIdFor(ownerId, catchId, photoId);
    const ref = db.doc(`users/${ownerId}/photoDeletionJobs/${id}`);
    const publicId = derivePublicId(ownerId, catchId, photoId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const existing = snapshot.data();
        if (existing.ownerId !== ownerId || existing.catchId !== catchId || existing.photoId !== photoId
          || existing.cloudinaryPublicId !== publicId) throw new Error("Photo deletion job identity conflict.");
        return { jobId: id, created: false, status: existing.status, deleteAfter: existing.deleteAfter };
      }
      const deleteAfterMs = requestedAtMs + deleteDelayMs;
      const job = {
        ownerId, catchId, photoId, cloudinaryPublicId: publicId,
        requestedAt: timestamp(requestedAtMs), deleteAfter: timestamp(deleteAfterMs),
        status: "pending", attempts: 0, lastAttemptAt: null, nextAttemptAt: timestamp(deleteAfterMs),
        leaseUntil: null, completedAt: null,
      };
      transaction.create(ref, job);
      return { jobId: id, created: true, status: job.status, deleteAfter: job.deleteAfter };
    });
  }

  async function enqueueFromTombstones() {
    let cursor = null;
    let scanned = 0;
    let enqueued = 0;
    let invalid = 0;
    while (true) {
      let query = db.collectionGroup("photos").where("deleted", "==", true).limit(pageSize);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      for (const snapshot of page.docs) {
        scanned += 1;
        const identity = identityFromPhotoPath(snapshot.ref.path);
        const photo = snapshot.data();
        if (!identity || photo.id !== identity.photoId || photo.deleted !== true
          || !validPhotoCloudLink(photo, identity.ownerId, identity.catchId, identity.photoId)) {
          invalid += 1;
          continue;
        }
        if (photo.cloudinaryDeletedAt) continue;
        const existing = await db.doc(`users/${identity.ownerId}/photoDeletionJobs/${jobIdFor(identity.ownerId, identity.catchId, identity.photoId)}`).get();
        if (!existing.exists) {
          // Backfill uses server discovery time; client-controlled deletedAt is not a trusted clock.
          await enqueue(identity);
          enqueued += 1;
        }
      }
      cursor = page.docs.at(-1);
      if (page.docs.length < pageSize) break;
    }
    return { scanned, enqueued, invalid };
  }

  async function claim(ref, identity) {
    const currentTime = now();
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const job = snapshot.data();
      const deleteAfterMs = readMillis(job.deleteAfter);
      if (job.ownerId !== identity.ownerId || job.catchId !== identity.catchId || job.photoId !== identity.photoId
        || job.cloudinaryPublicId !== derivePublicId(identity.ownerId, identity.catchId, identity.photoId)
        || !["pending", "retry", "deleting"].includes(job.status) || !Number.isFinite(deleteAfterMs) || deleteAfterMs > currentTime
        || (Number.isFinite(readMillis(job.nextAttemptAt)) && readMillis(job.nextAttemptAt) > currentTime)
        || (Number.isFinite(readMillis(job.leaseUntil)) && readMillis(job.leaseUntil) > currentTime)) return null;
      const claimed = {
        status: "deleting",
        attempts: (Number.isSafeInteger(job.attempts) ? job.attempts : 0) + 1,
        lastAttemptAt: timestamp(currentTime),
        leaseUntil: timestamp(currentTime + LEASE_MS),
        nextAttemptAt: timestamp(currentTime + LEASE_MS),
      };
      transaction.update(ref, claimed);
      return { ...job, ...claimed };
    });
  }

  async function processDueJobs() {
    let scanned = 0;
    let deleted = 0;
    let deferred = 0;
    let failed = 0;
    let cursor = null;
    while (true) {
      let query = db.collectionGroup("photoDeletionJobs")
        .where("status", "in", ["pending", "retry", "deleting"])
        .where("nextAttemptAt", "<=", timestamp(now()))
        .limit(pageSize);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      for (const snapshot of page.docs) {
      scanned += 1;
      const identity = identityFromJobPath(snapshot.ref.path);
      if (!identity) { failed += 1; continue; }
      const job = snapshot.data();
      if (job.ownerId !== identity.ownerId || !validIdentity(identity.ownerId, job.catchId, job.photoId)) {
        await snapshot.ref.update({ status: "permanent-failure", nextAttemptAt: null, leaseUntil: null, lastErrorCode: "invalid_job_identity" });
        failed += 1;
        continue;
      }
      if (job.cloudinaryPublicId !== derivePublicId(identity.ownerId, job.catchId, job.photoId)) {
        await snapshot.ref.update({ status: "permanent-failure", nextAttemptAt: null, leaseUntil: null, lastErrorCode: "invalid_job_identity" });
        failed += 1;
        continue;
      }
      const claimed = await claim(snapshot.ref, { ...identity, catchId: job.catchId, photoId: job.photoId });
      if (!claimed) { deferred += 1; continue; }
      const photoRef = db.doc(`users/${identity.ownerId}/catches/${claimed.catchId}/photos/${claimed.photoId}`);
      try {
        const catchRef = db.doc(`users/${identity.ownerId}/catches/${claimed.catchId}`);
        const [beforeDelete, catchSnapshot] = await Promise.all([photoRef.get(), catchRef.get()]);
        if ((catchSnapshot.exists && (catchSnapshot.data().ownerId !== identity.ownerId || catchSnapshot.data().id !== claimed.catchId))
          || (beforeDelete.exists && (beforeDelete.data().id !== claimed.photoId
            || !validPhotoCloudLink(beforeDelete.data(), identity.ownerId, claimed.catchId, claimed.photoId)))) {
          await snapshot.ref.update({ status: "permanent-failure", nextAttemptAt: null, leaseUntil: null, lastErrorCode: "invalid_owner_binding" });
          failed += 1;
          continue;
        }
        if ((beforeDelete.exists && beforeDelete.data().deleted !== true)
          || (catchSnapshot.exists && activeCatchReferencesPhoto(catchSnapshot.data(), claimed.photoId))) {
          await snapshot.ref.update({ status: "blocked-reference", nextAttemptAt: null, leaseUntil: null, lastErrorCode: "photo_still_active" });
          failed += 1;
          continue;
        }
        const cloudinary = await getCloudinary();
        let result;
        try {
          result = await cloudinary.uploader.destroy(claimed.cloudinaryPublicId, {
            resource_type: "image", type: "authenticated",
          });
        } catch (error) {
          if (!cloudinaryAssetMissing(error)) throw error;
          result = { result: "not found" };
        }
        if (result?.result !== "ok" && result?.result !== "not found") throw new Error("Provider did not confirm deletion.");
        const finalized = await db.runTransaction(async (transaction) => {
          const [photoSnapshot, jobSnapshot] = await Promise.all([transaction.get(photoRef), transaction.get(snapshot.ref)]);
          if (!jobSnapshot.exists || jobSnapshot.data().status !== "deleting"
            || jobSnapshot.data().attempts !== claimed.attempts) return false;
          const completedAtMs = now();
          if (photoSnapshot.exists) {
            const photo = photoSnapshot.data();
            if (photo.deleted !== true) throw new Error("Photo deletion tombstone is no longer present.");
            transaction.set(photoRef, { id: claimed.photoId, deleted: true,
              deletedAt: photo.deletedAt ?? new Date(completedAtMs).toISOString(),
              cloudinaryDeletedAt: new Date(completedAtMs).toISOString() });
          }
          transaction.update(snapshot.ref, { status: "deleted", completedAt: timestamp(completedAtMs),
            leaseUntil: null, nextAttemptAt: null });
          return true;
        });
        if (finalized) deleted += 1;
        else deferred += 1;
      } catch {
        const retryMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.min(claimed.attempts - 1, 10)));
        await snapshot.ref.update({ status: "retry", leaseUntil: null, nextAttemptAt: timestamp(now() + retryMs), lastErrorCode: "cloudinary_delete_failed" });
        failed += 1;
      }
      }
      cursor = page.docs.at(-1);
      if (page.docs.length < pageSize) break;
    }
    return { scanned, deleted, deferred, failed };
  }

  async function pruneCompletedJobs() {
    const cutoff = now() - PHOTO_DELETE_RECEIPT_PRUNE_MS;
    const snapshots = [];
    let pruned = 0;
    let cursor = null;
    while (true) {
      let query = db.collectionGroup("photoDeletionJobs").where("status", "==", "deleted").limit(pageSize);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      snapshots.push(...page.docs);
      cursor = page.docs.at(-1);
      if (page.docs.length < pageSize) break;
    }
    for (const snapshot of snapshots) {
      if (readMillis(snapshot.data().completedAt) <= cutoff) {
        await snapshot.ref.delete();
        pruned += 1;
      }
    }
    return pruned;
  }

  return Object.freeze({ enqueue, enqueueFromTombstones, processDueJobs, pruneCompletedJobs });
}
