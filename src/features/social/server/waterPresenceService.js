import { createHash, randomUUID } from "node:crypto";
import catalogue from "../../../../public/data/ris/be90ad549cf77679/index.json" with { type: "json" };
import { SOCIAL_PATHS, socialUid, validateSocialRecord } from "../data/socialModel.js";

const catalogueIds = new Set(catalogue.map(water => water.id));
export const WATER_PRESENCE_TTL_MS = 30 * 60_000;
const validSessionId = value => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const inactive = Object.freeze({ active: false });

export function createWaterPresenceService({ db, now = Date.now }) {
  function presenceRef(uid) {
    const key = createHash("sha256").update(socialUid(uid)).digest("hex");
    return db.doc(`${SOCIAL_PATHS.presence}/${key}`);
  }

  async function guard(tx, uid) {
    const [config, suspended, deleting] = await Promise.all([
      "adminConfig/social", `accountSuspensions/${uid}`, `accountDeletions/${uid}`,
    ].map(path => tx.get(db.doc(path))));
    if (suspended.exists || deleting.exists) throw new Error("account_unavailable");
    if (config.data()?.waterPresenceEnabled === false) throw new Error("social_disabled");
  }

  function active(snapshot, uid, time) {
    const row = snapshot.data();
    return row?.ownerUid === uid && catalogueIds.has(row.waterId) && validSessionId(row.sessionId)
      && Number.isSafeInteger(row.expiresAt) && row.expiresAt > time ? row : null;
  }

  function view(row) {
    return row ? { active: true, waterId: row.waterId, sessionId: row.sessionId, expiresAt: row.expiresAt } : inactive;
  }

  async function authorize(tx, uid, waterId) {
    const ref = presenceRef(uid);
    await guard(tx, uid);
    const row = active(await tx.get(ref), uid, now());
    if (!row || row.waterId !== waterId) throw new Error("water_presence_required");
    return view(row);
  }

  return {
    authorize,
    status(uid) {
      const ref = presenceRef(uid);
      return db.runTransaction(async tx => {
        await guard(tx, uid);
        return view(active(await tx.get(ref), uid, now()));
      });
    },
    join(uid, { waterId, confirmed, expectedSessionId = null } = {}) {
      if (!catalogueIds.has(waterId) || confirmed !== true
        || (expectedSessionId !== null && !validSessionId(expectedSessionId))) throw new Error("invalid_request");
      const ref = presenceRef(uid);
      return db.runTransaction(async tx => {
        await guard(tx, uid);
        const snapshot = await tx.get(ref);
        const time = now();
        const previous = active(snapshot, uid, time);
        if ((previous?.sessionId ?? null) !== expectedSessionId) throw new Error("water_presence_conflict");
        const row = validateSocialRecord("presence", {
          ownerUid: uid, waterId, sessionId: randomUUID(),
          createdAt: time, updatedAt: time, expiresAt: time + WATER_PRESENCE_TTL_MS,
        }, { now: time });
        tx.set(ref, row);
        return view(row);
      });
    },
    refresh(uid, sessionId) {
      if (!validSessionId(sessionId)) throw new Error("invalid_request");
      const ref = presenceRef(uid);
      return db.runTransaction(async tx => {
        await guard(tx, uid);
        const snapshot = await tx.get(ref);
        const time = now();
        const previous = active(snapshot, uid, time);
        if (previous?.sessionId !== sessionId) throw new Error("water_presence_conflict");
        const row = validateSocialRecord("presence", {
          ...previous, sessionId: randomUUID(), updatedAt: time, expiresAt: time + WATER_PRESENCE_TTL_MS,
        }, { now: time });
        tx.set(ref, row);
        return view(row);
      });
    },
    leave(uid, sessionId) {
      if (!validSessionId(sessionId)) throw new Error("invalid_request");
      const ref = presenceRef(uid);
      return db.runTransaction(async tx => {
        const previous = (await tx.get(ref)).data();
        if (!previous) return inactive;
        if (previous.ownerUid !== uid || previous.sessionId !== sessionId) throw new Error("water_presence_conflict");
        tx.delete(ref);
        return inactive;
      });
    },
  };
}
