import { randomUUID } from "node:crypto";
import { AiServiceError } from "./aiServiceError.js";

// Firestore transactions coordinate all Vercel instances and devices. A crashed
// request keeps its lease until expiry; no process-local counter authorizes work.
export function createAiRequestLease({ db, now = () => Date.now() }) {
  const refFor = (uid, key) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !/^[a-f0-9]{64}$/.test(key)) throw new TypeError("Invalid AI identity.");
    return db.doc(`users/${uid}/aiResults/lease-${key}`);
  };
  return {
    claim: async (uid, key, { consentRevision }) => {
      const ref = refFor(uid, key), time = now(), ticket = randomUUID();
      return db.runTransaction(async tx => {
        const [snapshot, cached, deleted] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}/aiResults/${key}`)), tx.get(db.doc(`accountDeletions/${uid}`))]);
        if (deleted.exists) throw new AiServiceError("account_unavailable");
        if (cached.exists && cached.data()?.ownerId === uid && cached.data()?.consentRevision === consentRevision) {
          throw new AiServiceError("request_in_progress", { retryAt: new Date(time + 1000).toISOString() });
        }
        const previous = snapshot.exists ? snapshot.data() : null;
        if (previous && previous.ownerId !== uid) throw new AiServiceError("quota_unavailable");
        if (Number.isFinite(previous?.retryAfterMs) && previous.retryAfterMs > time) {
          throw new AiServiceError("request_in_progress", { retryAt: new Date(previous.retryAfterMs).toISOString() });
        }
        tx.set(ref, { ownerId: uid, type: "inference-lease", consentRevision, ticket, state: "running",
          retryAfterMs: time + 120_000, createdAt: new Date(time).toISOString() });
        return ticket;
      });
    },
    finish: async (uid, key, ticket, { code = "complete", retryAt = null } = {}) => {
      const ref = refFor(uid, key);
      await db.runTransaction(async tx => {
        const [snapshot, deleted] = await Promise.all([tx.get(ref), tx.get(db.doc(`accountDeletions/${uid}`))]);
        if (deleted.exists) return;
        const previous = snapshot.exists ? snapshot.data() : null;
        if (previous?.ownerId !== uid || previous.ticket !== ticket) return;
        const retry = Date.parse(retryAt);
        tx.set(ref, { ...previous, state: code, retryAfterMs: Number.isFinite(retry) ? Math.max(now(), retry) : now(), ticket: "" });
      });
    },
  };
}
