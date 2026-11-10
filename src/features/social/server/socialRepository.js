import { createHash } from "node:crypto";
import { canonicalPair, canReadSocial, normalizedHandle, socialUid, validateSocialRecord } from "../data/socialModel.js";

// No public HTTP surface in stage 1. Future handlers must use this authenticated boundary.
// Admin roles deliberately grant no diary/social privacy bypass and no quota exemption.
export function createSocialRepository({ db, auth, now = () => Date.now() }) {
  const fail = code => { throw new Error(code); };
  async function identity(token) {
    if (typeof token !== "string" || !token) return fail("unauthenticated");
    const decoded = await auth.verifyIdToken(token, true);
    return socialUid(decoded.uid);
  }
  async function guard(tx, uid, mutation) {
    const refs = ["adminConfig/social", `accountSuspensions/${uid}`, `accountDeletions/${uid}`];
    const [config, suspension, deletion] = await Promise.all(refs.map(path => tx.get(db.doc(path))));
    if (config.data()?.enabled !== true) fail("social_disabled");
    if (suspension.exists || deletion.exists) fail("account_unavailable");
    if (mutation) {
      const ref = db.doc(`serverRateLimits/social-${createHash("sha256").update(uid).digest("hex")}`);
      const current = (await tx.get(ref)).data();
      const start = Math.floor(now() / 60_000) * 60_000;
      const count = current?.windowStart === start ? current.count : 0;
      if (!Number.isSafeInteger(count) || count < 0 || count >= 20) fail("social_rate_limit");
      // Return write so every transaction finishes all reads before any writes.
      return () => tx.set(ref, { windowStart: start, count: count + 1, expiresAt: start + 120_000 });
    }
    return () => {};
  }
  async function peer(tx, uid, targetUid) {
    socialUid(targetUid);
    const paths = [`socialBlocks/${uid}/blocked/${targetUid}`, `socialBlocks/${targetUid}/blocked/${uid}`,
      `accountSuspensions/${targetUid}`, `accountDeletions/${targetUid}`];
    const rows = await Promise.all(paths.map(path => tx.get(db.doc(path))));
    if (rows.some(row => row.exists)) fail("social_unavailable");
  }
  async function readProfile(tx, uid, targetUid) {
    await peer(tx, uid, targetUid);
    const [profile, relation] = await Promise.all([tx.get(db.doc(`publicProfiles/${targetUid}`)),
      uid === targetUid ? null : tx.get(db.doc(`socialRelationships/${canonicalPair(uid, targetUid)}`))]);
    if (!profile.exists || !canReadSocial({ viewerUid: uid, ownerUid: targetUid, visibility: profile.data().visibility,
      friends: relation?.data()?.status === "accepted" })) return null;
    const data = validateSocialRecord("profile", profile.data(), { now: now() });
    if (data.uid !== targetUid) fail("invalid_profile_identity");
    return data;
  }
  const repository = {
    async findByHandle(token, handle) {
      const uid = await identity(token), normalized = normalizedHandle(handle);
      return db.runTransaction(async tx => {
        await guard(tx, uid, false);
        const targetUid = (await tx.get(db.doc(`publicHandles/${normalized}`))).data()?.uid;
        if (!targetUid) return null;
        const profile = await readProfile(tx, uid, targetUid);
        return profile?.handle === normalized ? profile : null;
      });
    },
    async saveProfile(token, input) {
      const uid = await identity(token);
      if (!input || Object.keys(input).some(k => !["handle", "displayName", "bio", "visibility"].includes(k))) fail("invalid_profile");
      const handle = normalizedHandle(input.handle);
      return db.runTransaction(async tx => {
        const commitLimit = await guard(tx, uid, true);
        const ref = db.doc(`publicProfiles/${uid}`), claim = db.doc(`publicHandles/${handle}`);
        const [old, reserved] = await Promise.all([tx.get(ref), tx.get(claim)]);
        if (reserved.exists && reserved.data().uid !== uid) fail("handle_taken");
        const stamp = now();
        const profile = validateSocialRecord("profile", { uid, handle, displayName: input.displayName, bio: input.bio ?? "",
          visibility: input.visibility ?? "private", createdAt: old.data()?.createdAt ?? stamp, updatedAt: stamp }, { now: stamp });
        commitLimit();
        if (old.exists && old.data().handle !== handle) tx.delete(db.doc(`publicHandles/${old.data().handle}`));
        tx.set(ref, profile); tx.set(claim, { uid, createdAt: reserved.data()?.createdAt ?? stamp, updatedAt: stamp });
        return profile;
      });
    },
    async getProfile(token, targetUid) {
      const uid = await identity(token); socialUid(targetUid);
      return db.runTransaction(async tx => {
        await guard(tx, uid, false);
        return readProfile(tx, uid, targetUid);
      });
    },
    async relationship(token, targetUid, action) {
      const uid = await identity(token), pair = canonicalPair(uid, targetUid);
      if (!["request", "accept", "remove"].includes(action)) fail("invalid_action");
      return db.runTransaction(async tx => {
        const commitLimit = await guard(tx, uid, true); await peer(tx, uid, targetUid);
        if (action !== "remove" && !(await tx.get(db.doc(`publicProfiles/${targetUid}`))).exists) fail("social_unavailable");
        const ref = db.doc(`socialRelationships/${pair}`), old = (await tx.get(ref)).data();
        if (action === "accept" && (old?.status !== "pending" || old.requestedBy === uid)) fail("invalid_request");
        if (action === "request" && old) return old; // Idempotent; reversed requests never auto-accept.
        const stamp = now();
        const record = action === "remove" ? null : validateSocialRecord("relationship", { memberUids: [uid, targetUid].sort(),
          requestedBy: old?.requestedBy ?? uid, status: action === "accept" ? "accepted" : "pending",
          createdAt: old?.createdAt ?? stamp, updatedAt: stamp }, { now: stamp });
        commitLimit(); if (record) tx.set(ref, record); else tx.delete(ref);
        return record;
      });
    },
    async block(token, targetUid, blocked = true) {
      const uid = await identity(token), pair = canonicalPair(uid, targetUid);
      if (typeof blocked !== "boolean") fail("invalid_block");
      return db.runTransaction(async tx => {
        const commitLimit = await guard(tx, uid, true), stamp = now();
        const ref = db.doc(`socialBlocks/${uid}/blocked/${targetUid}`);
        const record = validateSocialRecord("block", { ownerUid: uid, targetUid, createdAt: stamp, updatedAt: stamp }, { now: stamp });
        commitLimit(); if (blocked) { tx.set(ref, record); tx.delete(db.doc(`socialRelationships/${pair}`)); } else tx.delete(ref);
      });
    },
  };
  return Object.freeze(repository);
}
