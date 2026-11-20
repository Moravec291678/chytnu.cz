import { createHash } from "node:crypto";
import { assertSocialInteraction } from "./socialAccess.js";

const alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";
export const NEARBY_PRESENCE_TTL_MS = 20 * 60_000;
export const NEARBY_MIN_GROUP_SIZE = 5;

export function coarseNearbyCell(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("invalid_request");
  let lat = [-90, 90], lon = [-180, 180], even = true, bits = 0, value = 0, result = "";
  while (result.length < 4) {
    const range = even ? lon : lat, coordinate = even ? longitude : latitude, midpoint = (range[0] + range[1]) / 2;
    value = (value << 1) | (coordinate >= midpoint ? 1 : 0);
    if (coordinate >= midpoint) range[0] = midpoint; else range[1] = midpoint;
    even = !even;
    if (++bits === 5) { result += alphabet[value]; bits = 0; value = 0; }
  }
  return result;
}

export function createNearbyPresenceService({ db, now = () => Date.now() }) {
  const presenceRef = uid => db.doc(`nearbyPresence/${createHash("sha256").update(uid).digest("hex")}`);
  const consentRef = uid => db.doc(`users/${uid}/socialPreferences/nearby`);
  async function groupLabel(cell, time) {
    const rows = await db.collection("nearbyPresence").where("coarseCell", "==", cell).limit(50).get();
    return rows.docs.filter(row => Number.isSafeInteger(row.data().expiresAt) && row.data().expiresAt > time).length >= NEARBY_MIN_GROUP_SIZE ? "5+" : null;
  }
  return {
    async status(uid) {
      return db.runTransaction(async tx => {
        const [consent, presence, suspended, deleting] = await Promise.all([
          consentRef(uid), presenceRef(uid), db.doc(`accountSuspensions/${uid}`), db.doc(`accountDeletions/${uid}`),
        ].map(ref => tx.get(ref)));
        if (suspended.exists || deleting.exists) throw new Error("account_unavailable");
        const receipt = consent.data();
        const accepted = receipt?.version === 1 && receipt?.accepted === true;
        const expiresAt = presence.data()?.expiresAt;
        return { accepted, showProfile: accepted && receipt.showProfile === true,
          expiresAt: accepted && Number.isSafeInteger(expiresAt) && expiresAt > now() ? expiresAt : null };
      });
    },
    async join(uid, payload) {
      if (!uid) throw new Error("authentication_required");
      const cell = coarseNearbyCell(payload.latitude, payload.longitude), time = now();
      await db.runTransaction(async tx => {
        const [consent, suspended, deleting] = await Promise.all([consentRef(uid), db.doc(`accountSuspensions/${uid}`), db.doc(`accountDeletions/${uid}`)].map(ref => tx.get(ref)));
        if (suspended.exists || deleting.exists) throw new Error("account_unavailable");
        if (consent.data()?.version !== 1 || consent.data()?.accepted !== true) throw new Error("consent_required");
        tx.set(presenceRef(uid), { ownerUid: uid, coarseCell: cell, expiresAt: time + NEARBY_PRESENCE_TTL_MS, createdAt: time });
      });
      return { active: true, expiresAt: time + NEARBY_PRESENCE_TTL_MS, nearbyCount: await groupLabel(cell, time) };
    },
    async setConsent(uid, accepted, showProfile = false) {
      if (!uid) throw new Error("authentication_required");
      if (typeof accepted !== "boolean" || typeof showProfile !== "boolean" || (showProfile && !accepted)) throw new Error("invalid_request");
      const time = now();
      await db.runTransaction(async tx => {
        if (!accepted) {
          const [previous, presence] = await Promise.all([tx.get(consentRef(uid)), tx.get(presenceRef(uid))]);
          if (previous.data()?.accepted === true) tx.set(consentRef(uid), { version: 1, accepted: false, showProfile: false, updatedAt: time, revokedAt: time });
          if (presence.exists) tx.delete(presenceRef(uid));
          return;
        }
        const [suspended, deleting] = await Promise.all([db.doc(`accountSuspensions/${uid}`), db.doc(`accountDeletions/${uid}`)].map(ref => tx.get(ref)));
        if (suspended.exists || deleting.exists) throw new Error("account_unavailable");
        tx.set(consentRef(uid), { version: 1, accepted, showProfile, updatedAt: time, acceptedAt: time });
      });
      return { accepted };
    },
    async discover(uid) {
      if (!uid) throw new Error("authentication_required");
      return db.runTransaction(async tx => {
        const [own, consent, suspended, deleting, config] = await Promise.all([
          presenceRef(uid), consentRef(uid), db.doc(`accountSuspensions/${uid}`), db.doc(`accountDeletions/${uid}`), db.doc("adminConfig/social"),
        ].map(ref => tx.get(ref)));
        const time = now();
        if (suspended.exists || deleting.exists) throw new Error("account_unavailable");
        if (config.data()?.profilesEnabled === false || config.data()?.discoveryEnabled === false) throw new Error("social_disabled");
        const session = own.data();
        if (consent.data()?.version !== 1 || consent.data()?.accepted !== true
          || !Number.isSafeInteger(session?.expiresAt) || session.expiresAt <= time) return { active: false, profiles: [] };
        const group = await tx.get(db.collection("nearbyPresence").where("coarseCell", "==", session.coarseCell).limit(50));
        const active = group.docs.map(row => row.data()).filter(row => Number.isSafeInteger(row.expiresAt) && row.expiresAt > time);
        if (active.length < NEARBY_MIN_GROUP_SIZE) return { active: true, profiles: [] };
        const profiles = await Promise.all(active.filter(row => row.ownerUid !== uid).slice(0, 8).map(async ({ ownerUid }) => {
          const [permission, profile] = await Promise.all([tx.get(consentRef(ownerUid)), tx.get(db.doc(`publicProfiles/${ownerUid}`))]);
          const value = profile.data();
          if (permission.data()?.version !== 1 || permission.data()?.accepted !== true || permission.data()?.showProfile !== true
            || value?.uid !== ownerUid
            || value?.visibility !== "public" || value.discoverable !== true
            || typeof value.displayName !== "string" || typeof value.handle !== "string") return null;
          try { await assertSocialInteraction({ tx, db, uid, targetUid: ownerUid }); }
          catch (error) { if (error.message === "social_unavailable") return null; throw error; }
          return { handle: value.handle, displayName: value.displayName };
        }));
        return { active: true, profiles: profiles.filter(Boolean) };
      });
    },
    async leave(uid) {
      if (!uid) throw new Error("authentication_required");
      await presenceRef(uid).delete();
      return { active: false };
    },
  };
}

async function cleanupExpiredPresence(collection, { db, now = Date.now, limit = 200 }) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError("Invalid cleanup limit");
  const cutoff = now();
  const expired = await db.collection(collection).where("expiresAt", "<=", cutoff).limit(limit).get();
  if (expired.empty || expired.docs.length === 0) return { deleted: 0, more: false };
  const deleted = await db.runTransaction(async tx => {
    const current = await Promise.all(expired.docs.map(row => tx.get(row.ref)));
    const stale = current.filter(row => Number.isSafeInteger(row.data()?.expiresAt) && row.data().expiresAt <= cutoff);
    stale.forEach(row => tx.delete(row.ref));
    return stale.length;
  });
  return { deleted, more: expired.docs.length === limit };
}

export const cleanupExpiredNearbyPresence = options => cleanupExpiredPresence("nearbyPresence", options);
export const cleanupExpiredWaterPresence = options => cleanupExpiredPresence("waterPresence", options);
