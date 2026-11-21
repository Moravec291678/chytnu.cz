import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { socialUid } from "../data/socialModel.js";
import { REPORT_REASONS } from "../data/socialInteractionModel.js";
import { assertSocialInteraction } from "./socialAccess.js";

const PAGE = 12;
const GROUP_ID = /^[a-f0-9]{64}$/;
const OPERATIONS = new Set(["invite", "accept", "decline", "leave", "remove", "moderator", "transfer", "visibility"]);
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = code => { throw new Error(code); };

export function createOnlineCrewService({ db, cursors, now = Date.now }) {
  async function configured(tx, uid) {
    const [settings, suspended, deleting] = await Promise.all([
      tx.get(db.doc("adminConfig/social")), tx.get(db.doc(`accountSuspensions/${uid}`)), tx.get(db.doc(`accountDeletions/${uid}`)),
    ]);
    if (settings.data()?.crewEnabled !== true) fail("social_disabled");
    if (suspended.exists || deleting.exists) fail("account_unavailable");
  }

  function dto(id, row, uid) {
    const owner = row.ownerUid === uid;
    const member = row.memberUids.includes(uid);
    const mod = member && row.moderatorUids.includes(uid);
    return { id, name: row.name, visibility: row.visibility, memberCount: row.memberUids.length, revision: row.revision,
      role: owner ? "owner" : mod ? "moderator" : member ? "member" : row.inviteUids.includes(uid) ? "invited" : null,
    };
  }

  async function view(tx, id, row, uid) {
    const crew = dto(id, row, uid);
    if (!["owner", "moderator"].includes(crew.role)) return crew;
    const allowed = await Promise.all([...new Set([...row.memberUids, ...row.inviteUids])].map(async targetUid => {
      try { if (targetUid !== uid) await assertSocialInteraction({ tx, db, uid, targetUid }); }
      catch (error) { if (error.message === "social_unavailable") return null; throw error; }
      const profile = (await tx.get(db.doc(`publicProfiles/${targetUid}`))).data();
      return { uid: targetUid, displayName: profile?.uid === targetUid && profile.visibility === "public" ? profile.displayName : null };
    }));
    return { ...crew, members: allowed.filter(person => person && row.memberUids.includes(person.uid))
      .map(person => ({ ...person, moderator: row.moderatorUids.includes(person.uid) })) };
  }

  function valid(row) {
    return row && !row.archived && row.moderationState !== "hidden" && Number.isSafeInteger(row.revision) && Array.isArray(row.memberUids)
      && Array.isArray(row.moderatorUids) && Array.isArray(row.inviteUids) && row.memberUids.includes(row.ownerUid);
  }

  function audit(tx, ref, row, operation) {
    tx.set(ref.collection("audit").doc(String(row.revision)), { operation, createdAt: row.updatedAt });
  }

  return {
    view(uid, crewId) {
      if (!GROUP_ID.test(crewId ?? "")) fail("invalid_request");
      return db.runTransaction(async tx => {
        await configured(tx, uid);
        const row = (await tx.get(db.doc(`crews/${crewId}`))).data();
        if (!valid(row) || !row.memberUids.includes(uid)) fail("social_unavailable");
        if (row.ownerUid !== uid) await assertSocialInteraction({ tx, db, uid, targetUid: row.ownerUid });
        return { crew: await view(tx, crewId, row, uid) };
      });
    },
    report(uid, { crewId, reason } = {}) {
      if (!GROUP_ID.test(crewId ?? "") || !REPORT_REASONS.includes(reason)) fail("invalid_request");
      return db.runTransaction(async tx => {
        await configured(tx, uid);
        const row = (await tx.get(db.doc(`crews/${crewId}`))).data();
        if (!valid(row) || row.ownerUid === uid || (row.visibility !== "public" && !row.memberUids.includes(uid) && !row.inviteUids.includes(uid))) fail("social_unavailable");
        await assertSocialInteraction({ tx, db, uid, targetUid: row.ownerUid });
        const time = now();
        const reportId = digest(JSON.stringify([uid, crewId, Math.floor(time / 86_400_000)]));
        const ref = db.doc(`socialReports/${reportId}`);
        if (!(await tx.get(ref)).exists) tx.set(ref, {
          reporterUid: uid, targetUid: row.ownerUid, crewId, reason, status: "new", createdAt: time, updatedAt: time,
        });
        return { reported: true };
      });
    },
    create(uid, { name, operationId } = {}) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 60 || /[\p{Cc}\p{Cf}]/u.test(name)
        || typeof operationId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(operationId)) fail("invalid_request");
      const id = digest(JSON.stringify([uid, operationId]));
      const ref = db.doc(`crews/${id}`);
      return db.runTransaction(async tx => {
        await configured(tx, uid);
        const previous = (await tx.get(ref)).data();
        if (previous) {
          if (previous.ownerUid !== uid || previous.name !== name.trim() || !valid(previous)) fail("crew_conflict");
          return { crew: dto(id, previous, uid) };
        }
        const owned = await tx.get(db.collection("crews").where("ownerUid", "==", uid).limit(6));
        if (owned.size >= 5) fail("request_limit");
        const time = now();
        const row = { ownerUid: uid, memberUids: [uid], moderatorUids: [], inviteUids: [], name: name.trim(), visibility: "private", revision: 1, createdAt: time, updatedAt: time };
        tx.set(ref, row);
        audit(tx, ref, row, "create");
        return { crew: dto(id, row, uid) };
      });
    },

    list(uid, { mode, cursor } = {}) {
      if (!["member", "invited", "public"].includes(mode)) fail("invalid_request");
      const context = `online-crew:${uid}:${mode}`;
      const boundary = cursors.decode(cursor, context);
      const groups = db.collection("crews");
      let query = (mode === "public" ? groups.where("visibility", "==", "public")
        : groups.where(mode === "member" ? "memberUids" : "inviteUids", "array-contains", uid)).orderBy(FieldPath.documentId());
      if (boundary) query = query.startAfter(boundary);
      return db.runTransaction(async tx => {
        await configured(tx, uid);
        const result = await tx.get(query.limit(PAGE + 1));
        const candidates = result.docs.slice(0, PAGE);
        const crews = await Promise.all(candidates.map(async snap => {
          const row = snap.data();
          if (!valid(row)) return null;
          if (row.ownerUid !== uid) {
            try { await assertSocialInteraction({ tx, db, uid, targetUid: row.ownerUid }); }
            catch (error) { if (error.message === "social_unavailable") return null; throw error; }
          }
          return dto(snap.id, row, uid);
        }));
        return { crews: crews.filter(Boolean), nextCursor: result.size > PAGE ? cursors.encode(candidates.at(-1).id, context) : null };
      });
    },

    change(uid, { crewId, operation, targetUid, visibility, enabled, expectedRevision } = {}) {
      if (!GROUP_ID.test(crewId ?? "") || !OPERATIONS.has(operation) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) fail("invalid_request");
      const ref = db.doc(`crews/${crewId}`);
      return db.runTransaction(async tx => {
        await configured(tx, uid);
        const old = (await tx.get(ref)).data();
        if (!valid(old)) fail("social_unavailable");
        const owner = old.ownerUid === uid;
        const member = old.memberUids.includes(uid);
        const moderator = old.moderatorUids.includes(uid);
        const invited = old.inviteUids.includes(uid);
        if (!member && !invited) fail("social_unavailable");
        if (!owner && !["leave", "decline"].includes(operation)) await assertSocialInteraction({ tx, db, uid, targetUid: old.ownerUid });
        if (expectedRevision !== old.revision) fail("crew_conflict");
        const row = { ...old, revision: old.revision + 1, updatedAt: now() };
        if (operation === "invite") {
          if (!owner && !moderator) fail("forbidden");
          if (old.memberUids.includes(targetUid) || old.inviteUids.includes(targetUid) || old.inviteUids.length >= PAGE) fail("crew_conflict");
          await assertSocialInteraction({ tx, db, uid, targetUid: socialUid(targetUid), requireFriend: true });
          if (!owner) await assertSocialInteraction({ tx, db, uid: old.ownerUid, targetUid });
          row.inviteUids = [...old.inviteUids, targetUid];
        } else if (operation === "accept" || operation === "decline") {
          if (!invited) fail("social_unavailable");
          if (operation === "accept") {
            if (old.memberUids.length >= PAGE) fail("crew_conflict");
            row.memberUids = [...old.memberUids, uid];
          }
          row.inviteUids = old.inviteUids.filter(id => id !== uid);
        } else if (operation === "leave" || operation === "remove") {
          const leaving = operation === "leave" ? uid : socialUid(targetUid);
          if (operation === "remove" && (!owner || leaving === uid)) fail("forbidden");
          if (!old.memberUids.includes(leaving)) fail("social_unavailable");
          if (leaving === old.ownerUid && old.memberUids.length > 1) fail("crew_conflict");
          row.memberUids = old.memberUids.filter(id => id !== leaving);
          row.moderatorUids = old.moderatorUids.filter(id => id !== leaving);
          if (!row.memberUids.length) {
            row.archived = true; row.inviteUids = []; row.visibility = "private";
          }
        } else if (operation === "visibility") {
          if (!owner) fail("forbidden");
          if (!["private", "public"].includes(visibility)) fail("invalid_request");
          row.visibility = visibility;
        } else {
          if (!owner) fail("forbidden");
          const target = socialUid(targetUid);
          if (target === uid || !old.memberUids.includes(target)) fail("social_unavailable");
          await assertSocialInteraction({ tx, db, uid, targetUid: target });
          if (operation === "transfer") {
            const targetGroups = await tx.get(db.collection("crews").where("ownerUid", "==", target).limit(5));
            if (targetGroups.size >= 5) fail("request_limit");
            row.ownerUid = target;
            row.moderatorUids = old.moderatorUids.filter(id => id !== target);
          } else {
            if (typeof enabled !== "boolean") fail("invalid_request");
            row.moderatorUids = enabled ? [...new Set([...old.moderatorUids, target])] : old.moderatorUids.filter(id => id !== target);
          }
        }
        const crew = row.memberUids.includes(uid) || row.inviteUids.includes(uid) ? dto(crewId, row, uid) : null;
        tx.set(ref, row);
        audit(tx, ref, row, operation);
        return { crew };
      });
    },
  };
}
