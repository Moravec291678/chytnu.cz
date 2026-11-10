import { createHash } from "node:crypto";
import { canonicalPair, canReadSocial, normalizedHandle, socialUid, validateSocialRecord } from "../data/socialModel.js";
import { sectionAllowed, validateProfileInput, validateStoredProfile } from "../data/publicProfileModel.js";
import { buildDiscoveryPrefixes } from "../data/discoveryModel.js";

// No public HTTP surface in stage 1. Future handlers must use this authenticated boundary.
// Admin roles deliberately grant no diary/social privacy bypass and no quota exemption.
export function createSocialRepository({ db, auth, now = () => Date.now(), profilesEnabled = false }) {
  const fail = code => { throw new Error(code); };
  async function identity(token) {
    if (typeof token !== "string" || !token) return fail("unauthenticated");
    const decoded = await auth.verifyIdToken(token, true);
    return socialUid(decoded.uid);
  }
  async function guard(tx, uid, mutation, profileOperation = false) {
    const refs = ["adminConfig/social", `accountSuspensions/${uid}`, `accountDeletions/${uid}`];
    const [config, suspension, deletion] = await Promise.all(refs.map(path => tx.get(db.doc(path))));
    if (profileOperation && config.data()?.profilesEnabled === false || config.data()?.enabled !== true && !(profileOperation && profilesEnabled)) fail("social_disabled");
    if (profileOperation === "discovery" && config.data()?.discoveryEnabled === false) fail("social_disabled");
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
    const data = validateStoredProfile(profile.data(), now());
    if (data.uid !== targetUid) fail("invalid_profile_identity");
    return data;
  }
  const repository = {
    async searchProfiles(token, query, searchToken, project) {
      const uid = await identity(token);
      return db.runTransaction(async tx => {
        await guard(tx, uid, false, "discovery");
        const page = await tx.get(query);
        const scanned = page.docs.slice(0, 10), users = [];
        for (const row of scanned) {
          let profile;
          try { profile = validateStoredProfile(row.data(), now()); } catch { continue; }
          if (profile.uid !== row.id || !buildDiscoveryPrefixes(profile).includes(searchToken)) continue;
          try { await peer(tx, uid, profile.uid); } catch (error) { if (error.message === "social_unavailable") continue; throw error; }
          const relationship = uid === profile.uid ? null : (await tx.get(db.doc(`socialRelationships/${canonicalPair(uid, profile.uid)}`))).data();
          const status = relationship?.status === "accepted" ? "friends" : relationship?.status === "pending"
            ? relationship.requestedBy === uid ? "outgoing" : relationship.requestedBy === profile.uid ? "incoming" : "none" : "none";
          // Directory summaries are PUBLIC projections even for existing friends.
          users.push({ ...await project({ tx, profile, audience: "stranger", viewerUid: uid }), relationship: { status } });
        }
        return { users, boundary: scanned.at(-1) ? { uid: scanned.at(-1).id, handle: scanned.at(-1).data().handle, createdAt: scanned.at(-1).data().createdAt } : null,
          hasMore: page.size > 10 };
      });
    },
    async readProfileSnapshot(token, target, read, { audience: preview } = {}) {
      const uid = token ? await identity(token) : null;
      if (typeof target !== "string") fail("invalid_profile");
      return db.runTransaction(async tx => {
        // Anonymous readers never mutate and receive PUBLIC sections only.
        if (uid) await guard(tx, uid, false, true);
        else {
          const config = (await tx.get(db.doc("adminConfig/social"))).data();
          if (config?.profilesEnabled === false || !profilesEnabled && config?.enabled !== true) fail("social_disabled");
        }
        const handle = target.startsWith("@") ? normalizedHandle(target.slice(1)) : null;
        const targetUid = handle ? (await tx.get(db.doc(`publicHandles/${handle}`))).data()?.uid : socialUid(target);
        if (!targetUid) return null;
        if (uid) await peer(tx, uid, targetUid);
        else if ((await Promise.all(["accountSuspensions", "accountDeletions"].map(name => tx.get(db.doc(`${name}/${targetUid}`))))).some(row => row.exists)) return null;
        const snapshot = await tx.get(db.doc(`publicProfiles/${targetUid}`));
        if (!snapshot.exists) return null;
        const profile = validateStoredProfile(snapshot.data(), now());
        if (profile.uid !== targetUid || handle && profile.handle !== handle) return null;
        if (handle && !profile.discoverable && uid !== targetUid) return null;
        const relation = uid && uid !== targetUid ? (await tx.get(db.doc(`socialRelationships/${canonicalPair(uid, targetUid)}`))).data() : null;
        let audience = uid === targetUid ? "owner" : relation?.status === "accepted" ? "friend" : "stranger";
        if (preview !== undefined) {
          if (uid !== targetUid || !["stranger", "friend"].includes(preview)) fail("forbidden");
          audience = preview;
        }
        if (!sectionAllowed(profile.visibility, audience)) return null;
        return read({ tx, profile, audience, viewerUid: uid });
      });
    },
    async findByHandle(token, handle) {
      const uid = await identity(token), normalized = normalizedHandle(handle);
      return db.runTransaction(async tx => {
        await guard(tx, uid, false);
        const targetUid = (await tx.get(db.doc(`publicHandles/${normalized}`))).data()?.uid;
        if (!targetUid) return null;
        const profile = await readProfile(tx, uid, targetUid);
        return profile?.handle === normalized && (profile.discoverable || uid === targetUid) ? profile : null;
      });
    },
    async saveProfile(token, input) {
      const uid = await identity(token);
      const editable = validateProfileInput(input), handle = editable.handle;
      return db.runTransaction(async tx => {
        const commitLimit = await guard(tx, uid, true, true);
        const ref = db.doc(`publicProfiles/${uid}`), claim = db.doc(`publicHandles/${handle}`);
        const [old, reserved] = await Promise.all([tx.get(ref), tx.get(claim)]);
        if (reserved.exists && reserved.data().uid !== uid) fail("handle_taken");
        const stamp = now();
        for (const catchId of new Set([...editable.sharedCatchIds, ...editable.sharedPhotos.map(p => p.catchId)])) {
          const record = (await tx.get(db.doc(`users/${uid}/catches/${catchId}`))).data();
          if (!record || record.deleted || record.ownerId !== uid) fail("invalid_shared_catch");
        }
        for (const photo of editable.sharedPhotos) {
          const record = (await tx.get(db.doc(`users/${uid}/catches/${photo.catchId}/photos/${photo.photoId}`))).data();
          if (!record || record.deleted || record.ownerId !== uid || record.type !== "image/jpeg" || record.cloud?.state !== "synced") fail("invalid_shared_photo");
        }
        const internal = old.exists ? validateStoredProfile(old.data(), stamp) : {};
        const profile = validateStoredProfile({ ...editable, uid, avatarRevision: internal.avatarRevision ?? 0,
          ...(internal.avatarVersion ? { avatarVersion: internal.avatarVersion, avatarAssetId: internal.avatarAssetId } : {}),
          createdAt: old.data()?.createdAt ?? stamp, updatedAt: stamp }, stamp);
        commitLimit();
        // Retain old claims: a rename can never redirect another angler's old identity.
        if (old.exists && old.data().handle !== handle) tx.set(db.doc(`publicHandles/${old.data().handle}`), { uid, retired: true, createdAt: old.data().createdAt, updatedAt: stamp });
        tx.set(ref, { ...profile, searchPrefixes: buildDiscoveryPrefixes(profile), discoveryIndexVersion: 1 });
        tx.set(claim, { uid, createdAt: reserved.data()?.createdAt ?? stamp, updatedAt: stamp });
        return profile;
      });
    },
    async getProfile(token, targetUid) {
      const uid = await identity(token); socialUid(targetUid);
      return db.runTransaction(async tx => {
        await guard(tx, uid, false, true);
        return readProfile(tx, uid, targetUid);
      });
    },
    async relationship(token, targetUid, action, { discovery = false } = {}) {
      const uid = await identity(token), pair = canonicalPair(uid, targetUid);
      if (!["request", "accept", "remove"].includes(action)) fail("invalid_action");
      return db.runTransaction(async tx => {
        const commitLimit = await guard(tx, uid, true, discovery ? "discovery" : false); await peer(tx, uid, targetUid);
        if (discovery && action !== "remove") {
          const [actor, target] = await Promise.all([tx.get(db.doc(`publicProfiles/${uid}`)), tx.get(db.doc(`publicProfiles/${targetUid}`))]);
          if (!actor.exists || action === "request" && (actor.data().visibility !== "public" || actor.data().discoverable !== true)) fail("profile_required");
          if (!target.exists || action === "request" && (target.data().visibility !== "public" || target.data().discoverable !== true)) fail("social_unavailable");
        }
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
        const commitLimit = await guard(tx, uid, true, true), stamp = now();
        const ref = db.doc(`socialBlocks/${uid}/blocked/${targetUid}`);
        const record = validateSocialRecord("block", { ownerUid: uid, targetUid, createdAt: stamp, updatedAt: stamp }, { now: stamp });
        commitLimit(); if (blocked) { tx.set(ref, record); tx.delete(db.doc(`socialRelationships/${pair}`)); } else tx.delete(ref);
      });
    },
  };
  return Object.freeze(repository);
}
