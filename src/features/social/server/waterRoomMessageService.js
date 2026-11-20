import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { socialUid, validateSocialRecord } from "../data/socialModel.js";
import { assertSocialInteraction } from "./socialAccess.js";

const ROOM_ID = /^ris-[a-f0-9]{24}$/;
const MESSAGE_ID = /^[a-f0-9]{64}$/;
const PAGE_SIZE = 15;
const digest = value => createHash("sha256").update(value).digest("hex");

export function createWaterRoomMessageService({ db, waterPresence, cursors, now = Date.now }) {
  const collection = waterId => `waterRooms/${waterId}/messages`;

  async function authorize(tx, uid, waterId) {
    if (!ROOM_ID.test(waterId ?? "")) throw new Error("invalid_request");
    await waterPresence.authorize(tx, uid, waterId);
    if ((await tx.get(db.doc("adminConfig/social"))).data()?.waterChatEnabled === false) throw new Error("social_disabled");
  }

  async function publicAuthor(tx, uid) {
    const row = (await tx.get(db.doc(`publicProfiles/${socialUid(uid)}`))).data();
    if (row?.uid !== uid || row.visibility !== "public" || typeof row.handle !== "string" || typeof row.displayName !== "string") return null;
    return { handle: row.handle, displayName: row.displayName };
  }

  function dto(row, author) {
    return { id: row.id, text: row.text, createdAt: row.createdAt, author };
  }

  return {
    send(uid, { waterId, text, operationId } = {}) {
      if (typeof text !== "string" || text.trim().length < 1 || text.trim().length > 500
        || typeof operationId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(operationId)) throw new Error("invalid_request");
      const body = text.trim();
      return db.runTransaction(async tx => {
        await authorize(tx, uid, waterId);
        const author = await publicAuthor(tx, uid);
        if (!author) throw new Error("profile_required");
        const id = digest(JSON.stringify([uid, waterId, operationId]));
        const path = `${collection(waterId)}/${id}`;
        const ref = db.doc(path);
        const existing = (await tx.get(ref)).data();
        if (existing) {
          if (existing.ownerUid !== uid || existing.text !== body || existing.moderationState !== "visible") throw new Error("message_conflict");
          return { message: dto(existing, author) };
        }
        const time = now();
        const validated = validateSocialRecord("message", { ownerUid: uid, text: body, createdAt: time, updatedAt: time }, { now: time });
        const row = { ...validated, id, moderationState: "visible" };
        tx.set(ref, row);
        tx.set(db.doc(`users/${uid}/socialReferences/${digest(path)}`), { path });
        return { message: dto(row, author) };
      });
    },
    list(uid, { waterId, cursor } = {}) {
      if (!ROOM_ID.test(waterId ?? "")) throw new Error("invalid_request");
      const context = `water-room:${socialUid(uid)}:${waterId}`;
      const boundary = cursors.decode(cursor, context);
      let query = db.collection(collection(waterId)).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
      if (boundary) {
        const match = /^(\d{1,16})_([a-f0-9]{64})$/.exec(boundary);
        if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error("invalid_cursor");
        query = query.startAfter(Number(match[1]), match[2]);
      }
      return db.runTransaction(async tx => {
        await authorize(tx, uid, waterId);
        const page = await tx.get(query.limit(PAGE_SIZE + 1));
        const candidates = page.docs.slice(0, PAGE_SIZE);
        const authors = new Map();
        function visibleAuthor(ownerUid) {
          if (!authors.has(ownerUid)) authors.set(ownerUid, (async () => {
            if (ownerUid !== uid) {
              try { await assertSocialInteraction({ tx, db, uid, targetUid: ownerUid }); }
              catch (error) { if (error.message === "social_unavailable") return null; throw error; }
            }
            return publicAuthor(tx, ownerUid);
          })());
          return authors.get(ownerUid);
        }
        const messages = await Promise.all(candidates.map(async snapshot => {
          const row = snapshot.data();
          if (row.moderationState !== "visible" || row.id !== snapshot.id || !MESSAGE_ID.test(row.id)
            || !Number.isSafeInteger(row.createdAt) || typeof row.text !== "string") return null;
          const author = await visibleAuthor(row.ownerUid);
          return author ? dto(row, author) : null;
        }));
        const last = candidates.at(-1);
        const nextCursor = page.size > PAGE_SIZE ? cursors.encode(`${last.data().createdAt}_${last.id}`, context) : null;
        return { messages: messages.filter(Boolean), nextCursor };
      });
    },
  };
}
