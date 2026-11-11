import { createHash } from "node:crypto";
import { canonicalPair, canReadSocial, normalizedHandle, socialUid, validateSocialRecord } from "../data/socialModel.js";
import { sectionAllowed, validateProfileInput, validateStoredProfile } from "../data/publicProfileModel.js";
import { buildDiscoveryPrefixes } from "../data/discoveryModel.js";
import { relationshipView, transitionRelationship } from "../data/relationshipModel.js";
import { assertSocialInteraction } from "./socialAccess.js";
import { createNotificationRecord } from "../../notifications/data/notificationModel.js";

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
    if (profileOperation === "friends" && config.data()?.friendshipsEnabled === false) fail("social_disabled");
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
    await assertSocialInteraction({ tx, db, uid, targetUid });
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
    async friendStatus(token, targetUid) {
      const uid = await identity(token), pair = canonicalPair(uid, targetUid);
      return db.runTransaction(async tx => {
        await guard(tx, uid, false, "friends");
        const [ownBlock, otherBlock, relation, actor, target, suspended, deleting] = await Promise.all([
          `socialBlocks/${uid}/blocked/${targetUid}`, `socialBlocks/${targetUid}/blocked/${uid}`, `socialRelationships/${pair}`,
          `publicProfiles/${uid}`, `publicProfiles/${targetUid}`, `accountSuspensions/${targetUid}`, `accountDeletions/${targetUid}`].map(p => tx.get(db.doc(p))));
        if (ownBlock.exists) return relationshipView(relation.data(), uid, { blocked: true });
        if (otherBlock.exists || suspended.exists || deleting.exists || !target.exists) return { status: "none", revision: 0, canRequest: false };
        const canRequest = actor.data()?.visibility === "public" && actor.data()?.discoverable === true && target.data()?.visibility === "public" && target.data()?.discoverable === true;
        const r = relation.data();
        return relationshipView(r, uid, { canRequest: canRequest && !(r?.rejectedUntil > now() || r?.status === "rejected" && now() - r.updatedAt < 24*60*60_000) });
      });
    },
    async friendsPage(token, query, tab, project) {
      const uid = await identity(token);
      return db.runTransaction(async tx => {
        await guard(tx, uid, false, "friends");
        const page = await tx.get(query), scanned = page.docs.slice(0,10), users = [];
        for (const row of scanned) {
          const relation = row.data(), targetUid = relation.memberUids?.find(member => member !== uid);
          if (!targetUid || row.id !== canonicalPair(uid, targetUid)) continue;
          const view = relationshipView(relation, uid);
          if (view.status !== (tab === "friends" ? "friends" : tab)) continue;
          try { await peer(tx, uid, targetUid); } catch (error) { if (error.message === "social_unavailable") continue; throw error; }
          const data = (await tx.get(db.doc(`publicProfiles/${targetUid}`))).data();
          let profile; try { if (data?.uid === targetUid) profile = validateStoredProfile(data, now()); } catch { /* Invalid identity is not projected. */ }
          if (!profile) continue;
          const audience = view.status === "friends" ? "friend" : "stranger";
          const visible = sectionAllowed(profile.visibility, audience);
          const snapshot = relation.identitySnapshots?.[targetUid];
          const summary = visible ? await project({ tx, profile, audience, viewerUid: uid }) : {
            uid: targetUid, handle: typeof snapshot?.handle === "string" ? snapshot.handle : "",
            displayName: typeof snapshot?.displayName === "string" ? snapshot.displayName : "Nedostupný profil" };
          users.push({ ...summary, relationship: view });
        }
        return { users, boundary: scanned.at(-1)?.id ?? null, hasMore: page.size > 10 };
      });
    },
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
          // Directory summaries are PUBLIC projections even for existing friends.
          users.push({ ...await project({ tx, profile, audience: "stranger", viewerUid: uid }), relationship: relationshipView(relationship, uid, { canRequest: uid !== profile.uid && !(relationship?.rejectedUntil > now() || relationship?.status === "rejected" && now() - relationship.updatedAt < 24*60*60_000) }) });
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
    async relationship(token, targetUid, action, { discovery = false, friendships = false, operationId, expectedRevision } = {}) {
      const uid = await identity(token), pair = canonicalPair(uid, targetUid);
      return db.runTransaction(async tx => {
        const commitLimit = await guard(tx, uid, true, friendships ? "friends" : discovery ? "discovery" : false); await peer(tx, uid, targetUid);
        const ref = db.doc(`socialRelationships/${pair}`), old = (await tx.get(ref)).data();
        if (operationId !== undefined && (typeof operationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(operationId))) fail("invalid_request");
        const receipt = operationId ? db.doc(`users/${uid}/socialMutations/${operationId}`) : null;
        const previous = receipt ? (await tx.get(receipt)).data() : null;
        if (previous) { if (previous.pair !== pair || previous.operation !== action) fail("relationship_conflict"); return old ?? null; }
        const [actor, target] = await Promise.all([tx.get(db.doc(`publicProfiles/${uid}`)), tx.get(db.doc(`publicProfiles/${targetUid}`))]);
        if ((friendships || discovery) && action === "request") {
          if (!actor.exists || actor.data().visibility !== "public" || actor.data().discoverable !== true) fail("profile_required");
          if (target.data()?.visibility !== "public" || target.data()?.discoverable !== true) fail("social_unavailable");
        }
        if (["request", "accept"].includes(action) && !target.exists) fail("social_unavailable");
        const stamp = now();
        const rejectedUntil = old?.rejectedUntil ?? (old?.status === "rejected" ? old.updatedAt + 24*60*60_000 : 0);
        if (action === "request" && rejectedUntil > stamp) fail("relationship_conflict");
        const transition = transitionRelationship({ record: old, uid, targetUid, operation: action, now: stamp, operationId, expectedRevision });
        if (!transition.changed) {
          if (receipt) { commitLimit(); tx.create(receipt, { pair, operation: action, createdAt: stamp }); }
          return transition.record;
        }
        const snapshots = action === "request" ? Object.fromEntries([[uid, actor.data()], [targetUid, target.data()]].filter(([,p]) => p)
          .map(([id,p]) => [id, { handle: p.handle, displayName: p.displayName }])) : old?.identitySnapshots;
        const notificationTimes = { ...old?.notificationTimes };
        const notify = transition.eventType && transition.eventType !== "removed"
          && (!Number.isSafeInteger(notificationTimes[transition.eventType]) || stamp - notificationTimes[transition.eventType] >= 10 * 60_000);
        if (notify) notificationTimes[transition.eventType] = stamp;
        const record = { ...transition.record, rejectedUntil: transition.record.status === "rejected" ? stamp + 24*60*60_000 : rejectedUntil, notificationTimes, ...(snapshots ? { identitySnapshots: snapshots } : {}) };
        commitLimit(); tx.set(ref, record);
        if (receipt) tx.create(receipt, { pair, operation: action, createdAt: stamp });
        if (transition.eventType) {
          tx.set(ref.collection("events").doc(`latest${transition.eventType}`), { type: transition.eventType, revision: record.revision, actorUid: uid, targetUid, createdAt: stamp });
          if (notify) {
            const recipient = transition.eventType === "requested" ? targetUid : record.requestedBy;
            const id = `friend_${createHash("sha256").update(pair).digest("hex").slice(0,32)}_${record.revision}_${transition.eventType}`;
            const notification = createNotificationRecord({ id, type: "social", title: transition.eventType === "requested" ? "Nová žádost o přátelství" : "Pozvání bylo přijato",
              body: "Aktuální propojení s rybáři najdeš v přehledu Přátelé.", deepLink: "/friends" }, { ownerId: recipient, scopeKey: `account:${recipient}` }, { now: new Date(stamp) });
            const stored = { ...notification }; delete stored.scopeKey;
            tx.set(db.doc(`users/${recipient}/notifications/${id}`), stored);
          }
        }
        return record;
      });
    },
    async block(token, targetUid, blocked = true) {
      const uid = await identity(token), pair = canonicalPair(uid, targetUid);
      if (typeof blocked !== "boolean") fail("invalid_block");
      return db.runTransaction(async tx => {
        const commitLimit = await guard(tx, uid, true, true), stamp = now();
        const ref = db.doc(`socialBlocks/${uid}/blocked/${targetUid}`);
        const pairRef = db.doc(`socialRelationships/${pair}`);
        const [own, other, existing] = await Promise.all([tx.get(ref), tx.get(db.doc(`socialBlocks/${targetUid}/blocked/${uid}`)), tx.get(pairRef)]);
        if (own.exists === blocked) return;
        const record = validateSocialRecord("block", { ownerUid: uid, targetUid, createdAt: stamp, updatedAt: stamp }, { now: stamp });
        const old = existing.data(), revision = (old?.revision ?? 0) + 1;
        commitLimit(); if (blocked) tx.set(ref, record); else tx.delete(ref);
        tx.set(pairRef, { memberUids: [uid,targetUid].sort(), requestedBy: old?.requestedBy ?? uid,
          status: blocked || other.exists ? "blocked" : "unfriended", revision, rejectedUntil: old?.rejectedUntil ?? (old?.status === "rejected" ? old.updatedAt + 24*60*60_000 : 0), notificationTimes: old?.notificationTimes ?? {}, createdAt: old?.createdAt ?? stamp, updatedAt: stamp, lastActorUid: uid });
        tx.set(pairRef.collection("events").doc("latestremoved"), { type: "revoked", revision, actorUid: uid, targetUid, createdAt: stamp });
      });
    },
  };
  return Object.freeze(repository);
}
