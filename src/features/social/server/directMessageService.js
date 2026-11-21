import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { canonicalPair, socialUid } from "../data/socialModel.js";
import { REPORT_REASONS } from "../data/socialInteractionModel.js";
import { assertSocialInteraction } from "./socialAccess.js";

const PAGE = 15;
const ID = /^[a-f0-9]{64}$/;
const digest = value => createHash("sha256").update(value).digest("hex");
const missing = () => new Error("social_unavailable");
const invalid = () => new Error("invalid_request");

export function removeDirectMessageText(tx, conversationRef, conversation, messageRef, message, recipientUid, time) {
  if (message.state !== "visible") return;
  tx.update(messageRef, { state: "deleted", text: "", deletedAt: time });
  const recipient = digest(recipientUid);
  if (message.sequence > (conversation.readThrough?.[recipient] ?? 0) && conversation.unread?.[recipient]) {
    tx.update(conversationRef, { unread: { ...conversation.unread, [recipient]: conversation.unread[recipient] - 1 } });
  }
}

export function createDirectMessageService({ db, cursors, now = Date.now }) {
  async function configured(tx) {
    if ((await tx.get(db.doc("adminConfig/social"))).data()?.directMessagesEnabled !== true) throw new Error("social_disabled");
  }

  async function thread(tx, uid, targetUid) {
    if (socialUid(uid) === socialUid(targetUid)) throw invalid();
    await configured(tx);
    await assertSocialInteraction({ tx, db, uid, targetUid, requireFriend: true });
    const id = canonicalPair(uid, targetUid);
    const ref = db.doc(`privateConversations/${id}`);
    const row = (await tx.get(ref)).data();
    if (row && (row.memberUids?.length !== 2 || !row.memberUids.includes(uid) || !row.memberUids.includes(targetUid))) throw missing();
    return { ref, row };
  }

  function otherUid(row, uid) {
    return row?.memberUids?.length === 2 && row.memberUids.includes(uid) ? row.memberUids.find(member => member !== uid) : null;
  }

  function messageDto(row, uid) {
    return { id: row.id, text: row.text, sequence: row.sequence, createdAt: row.createdAt, mine: row.ownerUid === uid };
  }

  return {
    send(uid, { targetUid, text, operationId } = {}) {
      if (typeof text !== "string" || !text.trim() || text.trim().length > 500
        || typeof operationId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(operationId)) throw invalid();
      const body = text.trim();
      return db.runTransaction(async tx => {
        const { ref, row } = await thread(tx, uid, targetUid);
        const id = digest(JSON.stringify([uid, operationId]));
        const messageRef = ref.collection("messages").doc(id);
        const previous = (await tx.get(messageRef)).data();
        if (previous) {
          if (previous.ownerUid !== uid || previous.text !== body || previous.state !== "visible") throw new Error("message_conflict");
          return { message: messageDto(previous, uid) };
        }
        const sequence = (row?.sequence ?? 0) + 1;
        if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("message_conflict");
        const createdAt = now();
        const message = { id, ownerUid: uid, text: body, sequence, createdAt, state: "visible" };
        const recipient = digest(targetUid);
        tx.set(messageRef, message);
        tx.set(ref, { memberUids: [uid, targetUid].sort(), sequence, updatedAt: createdAt,
          readThrough: row?.readThrough ?? {}, unread: { ...row?.unread, [recipient]: (row?.unread?.[recipient] ?? 0) + 1 } });
        return { message: messageDto(message, uid) };
      });
    },

    conversations(uid, { cursor } = {}) {
      const context = `direct-conversations:${socialUid(uid)}`;
      const boundary = cursors.decode(cursor, context);
      let query = db.collection("privateConversations").where("memberUids", "array-contains", uid)
        .orderBy(FieldPath.documentId());
      if (boundary) query = query.startAfter(boundary);
      return db.runTransaction(async tx => {
        await configured(tx);
        const [page, suspended, deleting] = await Promise.all([
          tx.get(query.limit(PAGE + 1)), tx.get(db.doc(`accountSuspensions/${uid}`)), tx.get(db.doc(`accountDeletions/${uid}`)),
        ]);
        if (suspended.exists || deleting.exists) throw new Error("account_unavailable");
        const candidates = page.docs.slice(0, PAGE);
        const summaries = await Promise.all(candidates.map(async snapshot => {
          const row = snapshot.data();
          const targetUid = otherUid(row, uid);
          if (!targetUid || canonicalPair(uid, targetUid) !== snapshot.id) return null;
          try { await assertSocialInteraction({ tx, db, uid, targetUid, requireFriend: true }); }
          catch (error) { if (error.message === "social_unavailable") return null; throw error; }
          const identity = (await tx.get(db.doc(`publicProfiles/${targetUid}`))).data();
          return { targetUid, displayName: identity?.uid === targetUid && ["public", "friends"].includes(identity.visibility) ? identity.displayName : null,
            updatedAt: row.updatedAt, unread: row.unread?.[digest(uid)] ?? 0 };
        }));
        const nextCursor = page.size > PAGE ? cursors.encode(candidates.at(-1).id, context) : null;
        return { conversations: summaries.filter(Boolean), nextCursor };
      });
    },

    list(uid, { targetUid, cursor } = {}) {
      const pair = canonicalPair(uid, targetUid);
      const context = `direct-messages:${uid}:${pair}`;
      const boundary = cursors.decode(cursor, context);
      if (boundary !== null && (!/^\d{1,16}$/.test(boundary) || !Number.isSafeInteger(Number(boundary)))) throw invalid();
      return db.runTransaction(async tx => {
        const { ref, row } = await thread(tx, uid, targetUid);
        if (!row) return { messages: [], revision: 0, nextCursor: null };
        let query = ref.collection("messages").orderBy("sequence", "desc");
        if (boundary) query = query.startAfter(Number(boundary));
        const page = await tx.get(query.limit(PAGE + 1));
        const candidates = page.docs.slice(0, PAGE);
        const messages = candidates.flatMap(entry => entry.data().state === "visible" ? [messageDto(entry.data(), uid)] : []);
        return { messages, revision: row.sequence, nextCursor: page.size > PAGE ? cursors.encode(String(candidates.at(-1).data().sequence), context) : null };
      });
    },

    markRead(uid, { targetUid, revision } = {}) {
      if (!Number.isSafeInteger(revision) || revision < 0) throw invalid();
      return db.runTransaction(async tx => {
        const { ref, row } = await thread(tx, uid, targetUid);
        if ((row?.sequence ?? 0) !== revision) throw new Error("message_conflict");
        const reader = digest(uid);
        if (row?.unread?.[reader]) tx.update(ref, {
          unread: { ...row.unread, [reader]: 0 }, readThrough: { ...row.readThrough, [reader]: revision },
        });
        return { marked: true };
      });
    },

    remove(uid, { targetUid, messageId } = {}) {
      if (!ID.test(messageId ?? "")) throw invalid();
      return db.runTransaction(async tx => {
        const { ref, row } = await thread(tx, uid, targetUid);
        if (!row) throw missing();
        const messageRef = ref.collection("messages").doc(messageId);
        const message = (await tx.get(messageRef)).data();
        if (!message || message.ownerUid !== uid) throw new Error("message_unavailable");
        removeDirectMessageText(tx, ref, row, messageRef, message, targetUid, now());
        return { deleted: true };
      });
    },

    report(uid, { targetUid, messageId, reason } = {}) {
      if (!ID.test(messageId ?? "") || !REPORT_REASONS.includes(reason)) throw invalid();
      return db.runTransaction(async tx => {
        const { ref, row } = await thread(tx, uid, targetUid);
        if (!row) throw missing();
        const message = (await tx.get(ref.collection("messages").doc(messageId))).data();
        if (!message || message.ownerUid !== targetUid || message.state !== "visible") throw new Error("message_unavailable");
        const time = now();
        const reportId = digest(JSON.stringify([uid, ref.id, messageId, Math.floor(time / 86_400_000)]));
        const reportRef = db.doc(`socialReports/${reportId}`);
        if (!(await tx.get(reportRef)).exists) tx.set(reportRef, {
          reporterUid: uid, targetUid, conversationId: ref.id, messageId, reason, status: "new", createdAt: time, updatedAt: time,
        });
        return { reported: true };
      });
    },
  };
}
