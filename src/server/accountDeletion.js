import { createHash } from "node:crypto";

const RECEIPT_RETENTION_MS = 29 * 24 * 60 * 60 * 1000;
const LEASE_MS = 15 * 60 * 1000;
const PHOTO_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function createAccountDeletionService({ db, auth, photoDeletion, now = () => Date.now(), pageSize = 50 } = {}) {
  if (!db || !auth || !photoDeletion?.enqueue) throw new TypeError("Account deletion dependencies are required.");
  const receipt = (uid) => db.doc(`accountDeletions/${uid}`);
  const stamp = () => new Date(now()).toISOString();

  async function request(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128 || uid.includes("/")) throw new TypeError("Invalid account identity.");
    const ref = receipt(uid);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) return snapshot.data();
      const state = { ownerId: uid, status: "requested", phase: "revoke", requestedAt: stamp(),
        updatedAt: stamp(), completedAt: null, cursor: null, attempts: 0, leaseUntil: null, lastErrorCode: null };
      transaction.create(ref, state);
      return state;
    });
  }

  async function claim(uid) {
    const ref = receipt(uid);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const state = snapshot.data();
      if (state.ownerId !== uid || state.status === "completed"
        || (state.leaseUntil && Date.parse(state.leaseUntil) > now())) return null;
      const next = { ...state, status: "processing", attempts: (state.attempts ?? 0) + 1,
        leaseUntil: new Date(now() + LEASE_MS).toISOString(), updatedAt: stamp() };
      transaction.update(ref, next);
      return next;
    });
  }

  async function processOwner(uid) {
    const state = await claim(uid);
    if (!state) return (await receipt(uid).get()).data() ?? null;
    const ref = receipt(uid);
    let phase = state.phase;
    let cursor = state.cursor;
    try {
      if (phase === "revoke") {
        try { await auth.revokeRefreshTokens(uid); }
        catch (error) { if (error?.code !== "auth/user-not-found") throw error; }
        phase = "photos";
      }
      if (phase === "photos") {
        // listDocuments includes missing parent documents that still own photo subcollections.
        const references = await db.collection(`users/${uid}/catches`).listDocuments();
        const page = references.filter((entry) => !cursor || entry.id > cursor)
          .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0).slice(0, pageSize);
        for (const entry of page) {
          const snapshot = await entry.get();
          const data = snapshot.exists ? snapshot.data() : {};
          const photos = await entry.collection("photos").get();
          const ids = new Set([
            ...photos.docs.map((photo) => photo.id),
            ...(Array.isArray(data.photos) ? data.photos.map((photo) => photo?.id) : []),
            ...(data.photoRefs && typeof data.photoRefs === "object" ? Object.keys(data.photoRefs) : []),
            ...(Array.isArray(data.photoIds) ? data.photoIds : []),
          ]);
          for (const photoId of ids) {
            if (!PHOTO_ID.test(photoId ?? "")) throw new Error("invalid_photo_identity");
            await photoDeletion.enqueue({ ownerId: uid, catchId: entry.id, photoId });
          }
          cursor = entry.id;
          await ref.update({ cursor, phase, updatedAt: stamp() });
        }
        if (page.length < pageSize) { phase = "data"; cursor = null; }
      }
      if (phase === "data") {
        const userRef = db.doc(`users/${uid}`);
        const collections = await userRef.listCollections();
        let removed = 0;
        for (const collection of collections) {
          if (collection.id === "photoDeletionJobs") continue;
          const documents = await collection.listDocuments();
          for (const document of documents.slice(0, pageSize - removed)) {
            await db.recursiveDelete(document);
            removed += 1;
          }
          if (removed >= pageSize) break;
        }
        if (removed > 0) {
          await ref.update({ phase, cursor: null, status: "retry", leaseUntil: null, lastErrorCode: null, updatedAt: stamp() });
          return { ...state, phase, status: "retry", lastErrorCode: null };
        }
        await Promise.all([
          db.doc(`serverRateLimits/photo-cloud-${createHash("sha256").update(uid).digest("hex")}`).delete(),
          db.doc(`serverRateLimits/progression-${uid}`).delete(),
        ]);
        await userRef.delete();
        phase = "auth";
      }
      if (phase === "auth") {
        try { await auth.deleteUser(uid); }
        catch (error) { if (error?.code !== "auth/user-not-found") throw error; }
        phase = "cleanup-pending";
      }
      if (phase === "cleanup-pending") {
        const jobs = await db.collection(`users/${uid}/photoDeletionJobs`).where("status", "!=", "deleted").limit(pageSize).get();
        for (const job of jobs.docs) {
          if (job.data().status === "blocked-reference") {
            // All active Catch records are gone now; let the shared cleanup worker recheck the asset.
            await job.ref.update({ status: "retry", nextAttemptAt: job.data().deleteAfter, lastErrorCode: null });
          }
        }
        const pending = !jobs.empty;
        const failed = jobs.docs.some((job) => job.data().status === "permanent-failure");
        const result = { phase, status: failed ? "partial-failure" : pending ? "cleanup-pending" : "completed", leaseUntil: null,
          updatedAt: stamp(), ...(pending ? {} : { completedAt: stamp() }),
          lastErrorCode: failed ? "photo_cleanup_needs_attention" : null };
        await ref.update(result);
        return { ...state, ...result };
      }
      await ref.update({ phase, cursor, status: "retry", leaseUntil: null, lastErrorCode: null, updatedAt: stamp() });
      return { ...state, phase, status: "retry", lastErrorCode: null };
    } catch {
      await ref.update({ phase, cursor, status: "retry", leaseUntil: null,
        lastErrorCode: "account_delete_step_failed", updatedAt: stamp() });
      return { ...state, phase, cursor, status: "retry", lastErrorCode: "account_delete_step_failed" };
    }
  }

  async function advanceOwner(uid, { maxSteps = 20, maxMillis = 8000 } = {}) {
    const started = Date.now();
    let result = null;
    for (let step = 0; step < maxSteps && Date.now() - started < maxMillis; step += 1) {
      result = await processOwner(uid);
      if (result?.status !== "retry" || result.lastErrorCode) break;
    }
    return result;
  }

  async function processPending() {
    const page = await db.collection("accountDeletions").where("status", "in",
      ["requested", "processing", "retry", "cleanup-pending", "partial-failure"])
      .orderBy("updatedAt").limit(pageSize).get();
    const results = [];
    for (const entry of page.docs) {
      try { results.push(await advanceOwner(entry.id, { maxMillis: 2000 })); }
      catch { results.push({ status: "retry", lastErrorCode: "account_delete_step_failed" }); }
    }
    return results;
  }

  async function pruneCompleted() {
    const cutoff = new Date(now() - RECEIPT_RETENTION_MS).toISOString();
    // Auth is already gone in this phase. The photo jobs remain independently retryable.
    const page = await db.collection("accountDeletions").where("phase", "==", "cleanup-pending")
      .where("requestedAt", "<=", cutoff).limit(pageSize).get();
    for (const entry of page.docs) await entry.ref.delete();
    return page.size;
  }

  return Object.freeze({ request, processOwner, advanceOwner, processPending, pruneCompleted });
}

