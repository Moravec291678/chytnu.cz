import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { socialUid } from "../data/socialModel.js";
import { interactionInput, REACTION_KINDS } from "../data/socialInteractionModel.js";
import { assertSocialInteraction } from "./socialAccess.js";
import { interactionCounts, changeInteractionCounts, interactionReferenceId } from "./socialInteractionCounters.js";
import { configuredCoCreatorUid, configuredOwnerUid } from "../../admin/server/adminAccess.js";
import { createNotificationRecord } from "../../notifications/data/notificationModel.js";
const fail = (code = "post_unavailable") => { throw new Error(code); };
export function createSocialInteractionService({ db, publications, cursors, env = {}, now = () => Date.now() }) {
  function viewer(uid) { if (!uid) fail("authentication_required"); socialUid(uid); }
  async function post(tx, uid, postId) {
    const ref = db.doc(`socialPosts/${postId}`), row = (await tx.get(ref)).data();
    if (!await publications.permitted(tx, uid, row)) fail();
    return { ref, row };
  }
  async function quota(tx, uid, family) {
    const hash = createHash("sha256").update(uid).digest("hex"), stamp = now();
    const windows = [["minute", Math.floor(stamp / 60000), family === "reaction" ? 20 : 10], ["day", Math.floor(stamp / 86400000), family === "reaction" ? 200 : 60]];
    const refs = windows.map(([unit]) => db.doc(`serverRateLimits/social-${family}-${unit}-${hash}`));
    const saved = await Promise.all(refs.map(ref => tx.get(ref)));
    const values = windows.map(([, window, maximum], index) => {
      const old = saved[index].data(), count = old?.window === window ? old.count : 0;
      if (!Number.isSafeInteger(count) || count < 0 || count >= maximum) fail("request_limit");
      return { window, count: count + 1 };
    });
    return () => refs.forEach((ref, index) => tx.set(ref, values[index]));
  }
  function reference(tx, uid, path) { tx.set(db.doc(`users/${uid}/socialReferences/${interactionReferenceId(path)}`), { path }); }
  async function socialNotification(tx, { recipientUid, actorUid, kind, eventId, postId, stamp }) {
    if (!recipientUid || recipientUid === actorUid) return null;
    const preferenceRef = db.doc(`users/${recipientUid}/notificationPreferences/social`);
    const notificationId = `social_${kind}_${createHash("sha256").update(`${recipientUid}/${actorUid}/${eventId}`).digest("hex").slice(0, 36)}`;
    const notificationRef = db.doc(`users/${recipientUid}/notifications/${notificationId}`);
    const [preferences, existing] = await Promise.all([tx.get(preferenceRef), tx.get(notificationRef)]);
    if (preferences.data()?.[kind] === false || existing.exists) return null;
    const copy = kind === "reactions"
      ? { title: "Nová reakce", body: "Někdo reagoval na tvůj příspěvek." }
      : { title: "Nový komentář", body: "Někdo okomentoval tvůj příspěvek." };
    const record = createNotificationRecord({ id: notificationId, type: "social", ...copy,
      createdAt: new Date(stamp).toISOString(), deepLink: `/community/post/${postId}` },
    { ownerId: recipientUid, scopeKey: `account:${recipientUid}` }, { now: new Date(stamp) });
    const stored = { ...record }; delete stored.scopeKey;
    return { ref: notificationRef, record: stored };
  }
  async function author(tx, uid) {
    const profile = (await tx.get(db.doc(`publicProfiles/${uid}`))).data();
    if (profile?.uid !== uid) fail("save_profile_first");
    return {
      uid,
      handle: profile.handle,
      displayName: profile.displayName,
      badgeRole: uid === configuredOwnerUid(env) ? "OWNER" : uid === configuredCoCreatorUid(env) ? "CO_CREATOR" : null,
      ...(profile.avatarVersion && profile.avatarAssetId ? { avatarVersion: createHash("sha256").update(profile.avatarAssetId).digest("hex").slice(0, 16) } : {}),
    };
  }
  const summary = (row, reaction) => ({ counts: interactionCounts(row).reactionCounts, myReaction: REACTION_KINDS.includes(reaction?.kind) && !reaction.deleted ? reaction.kind : null, commentCount: interactionCounts(row).commentCount });
  const commentDto = (row, identity) => ({ id: row.id, author: identity, text: row.text, createdAt: row.createdAt, updatedAt: row.updatedAt, revision: row.revision });
  return {
    async setReaction(uid, payload) {
      viewer(uid); const input = interactionInput(payload, "reaction");
      return db.runTransaction(async tx => {
        const { ref, row } = await post(tx, uid, input.postId), path = `${ref.path}/reactions/${uid}`, reactionRef = db.doc(path);
        const receiptRef = db.doc(`users/${uid}/socialMutations/reaction_${input.operationId}`);
        const [existing, receipt] = await Promise.all([tx.get(reactionRef), tx.get(receiptRef)]), old = existing.data();
        if (receipt.exists) {
          if (receipt.data().postId !== input.postId || receipt.data().kind !== input.kind) fail("interaction_conflict");
          return summary(row, old);
        }
        const commitQuota = await quota(tx, uid, "reaction");
        const previous = !old?.deleted ? old?.kind : null, stamp = now();
        if (row.ownerUid !== uid) await assertSocialInteraction({ tx, db, uid, targetUid: row.ownerUid });
        const notification = input.kind && !previous ? await socialNotification(tx, {
          recipientUid: row.ownerUid, actorUid: uid, kind: "reactions", eventId: `${input.postId}/${uid}`, postId: input.postId, stamp,
        }) : null;
        const updated = changeInteractionCounts(row, { previousReaction: previous, nextReaction: input.kind });
        if (input.kind === null) {
          tx.delete(reactionRef); tx.delete(db.doc(`users/${uid}/socialReferences/${interactionReferenceId(path)}`));
        } else {
          tx.set(reactionRef, { ownerUid: uid, kind: input.kind, createdAt: old?.createdAt ?? stamp, updatedAt: stamp }); reference(tx, uid, path);
        }
        tx.update(ref, updated); tx.set(receiptRef, { postId: input.postId, kind: input.kind, createdAt: stamp });
        if (notification) tx.create(notification.ref, notification.record);
        commitQuota();
        return summary(updated, input.kind ? { kind: input.kind } : null);
      });
    },
    async saveComment(uid, payload) {
      viewer(uid); const input = interactionInput(payload, "save");
      return db.runTransaction(async tx => {
        const { ref, row } = await post(tx, uid, input.postId), path = `${ref.path}/comments/${input.commentId}`, commentRef = db.doc(path);
        const old = (await tx.get(commentRef)).data();
        if (old && (old.ownerUid !== uid || old.deleted)) fail("comment_unavailable");
        if ((old?.revision ?? 0) !== input.expectedRevision) fail("comment_conflict");
        const identity = await author(tx, uid);
        if (old?.text === input.text) return { comment: commentDto(old, identity), commentCount: interactionCounts(row).commentCount };
        const spamKey = createHash("sha256").update(`${input.postId}\n${input.text.toLocaleLowerCase("cs")}`).digest("hex");
        const spamRef = db.doc(`users/${uid}/socialCommentSpam/${spamKey}`), spam = (await tx.get(spamRef)).data(), stamp = now();
        if (spam && spam.commentId !== input.commentId && stamp - spam.createdAt < 60000) fail("comment_duplicate");
        const commitQuota = await quota(tx, uid, "comment");
        if (!old && row.ownerUid !== uid) await assertSocialInteraction({ tx, db, uid, targetUid: row.ownerUid });
        const notification = !old ? await socialNotification(tx, {
          recipientUid: row.ownerUid, actorUid: uid, kind: "comments", eventId: `${input.postId}/${input.commentId}`, postId: input.postId, stamp,
        }) : null;
        const saved = { id: input.commentId, ownerUid: uid, text: input.text, revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? stamp, updatedAt: stamp, deleted: false, moderationState: old?.moderationState ?? "visible" };
        const updated = changeInteractionCounts(row, { comments: old ? 0 : 1 });
        tx.set(commentRef, saved); tx.update(ref, updated); reference(tx, uid, path); tx.set(spamRef, { commentId: input.commentId, createdAt: stamp });
        if (notification) tx.create(notification.ref, notification.record);
        commitQuota();
        return { comment: commentDto(saved, identity), commentCount: updated.commentCount };
      });
    },
    async deleteComment(uid, payload) {
      viewer(uid); const input = interactionInput(payload, "delete");
      return db.runTransaction(async tx => {
        const { ref, row } = await post(tx, uid, input.postId), commentRef = db.doc(`${ref.path}/comments/${input.commentId}`), old = (await tx.get(commentRef)).data();
        if (!old || old.ownerUid !== uid) fail("comment_unavailable");
        if (old.deleted) return { deleted: true, commentCount: interactionCounts(row).commentCount };
        if (input.expectedRevision !== undefined && old.revision !== input.expectedRevision) fail("comment_conflict");
        const commitQuota = await quota(tx, uid, "comment"), updated = changeInteractionCounts(row, { comments: old.moderationState === "hidden" ? 0 : -1 });
        tx.set(commentRef, { ...old, text: "", deleted: true, revision: old.revision + 1, updatedAt: now() }); tx.update(ref, updated); commitQuota();
        return { deleted: true, commentCount: updated.commentCount };
      });
    },
    async createReport(uid, payload) {
      viewer(uid); const input = interactionInput(payload, "report");
      return db.runTransaction(async tx => {
        const { ref, row } = await post(tx, uid, input.postId);
        let targetOwnerUid = row.ownerUid;
        if (input.commentId) {
          const commentRef = db.doc(`${ref.path}/comments/${input.commentId}`);
          const comment = (await tx.get(commentRef)).data();
          if (!comment || comment.deleted || comment.moderationState !== "visible") fail("comment_unavailable");
          targetOwnerUid = comment.ownerUid;
        }
        await assertSocialInteraction({ tx, db, uid, targetUid: targetOwnerUid });
        const stamp = now();
        const day = Math.floor(stamp / 86400000);
        const hash = createHash("sha256").update(`${uid}/${input.postId}/${input.commentId ?? ""}/${day}`).digest("hex");
        const receiptRef = db.doc(`users/${uid}/socialReportReceipts/${hash}`);
        const receipt = (await tx.get(receiptRef)).data();
        if (receipt) return { reported: true };
        const limitHash = createHash("sha256").update(uid).digest("hex");
        const minute = Math.floor(stamp / 60000);
        const limitRef = db.doc(`serverRateLimits/social-report-${limitHash}`);
        const limit = (await tx.get(limitRef)).data();
        const used = limit?.minute === minute ? limit.count : 0;
        if (!Number.isSafeInteger(used) || used >= 10) fail("request_limit");
        const reportId = hash;
        tx.set(db.doc(`socialReports/${reportId}`), {
          reporterUid: uid,
          postId: input.postId,
          commentId: input.commentId ?? null,
          targetUid: targetOwnerUid,
          reason: input.reason,
          details: input.details?.trim() || "",
          status: "new",
          createdAt: stamp,
          updatedAt: stamp,
        });
        tx.set(receiptRef, { reportId, createdAt: stamp });
        tx.set(limitRef, { minute, count: used + 1 });
        return { reported: true };
      });
    },
    async list(uid, payload) {
      viewer(uid); const input = interactionInput(payload, "list"), context = `interactions:${uid}:${input.postId}`, after = cursors.decode(input.cursor, context);
      let query = db.collection(`socialPosts/${input.postId}/comments`).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
      if (after) {
        const match = /^(\d{1,16})_([a-f0-9-]{36})$/.exec(after);
        if (!match || !Number.isSafeInteger(Number(match[1]))) fail("invalid_cursor");
        query = query.startAfter(Number(match[1]), match[2]);
      }
      return db.runTransaction(async tx => {
        const { row } = await post(tx, uid, input.postId);
        const [page, reaction] = await Promise.all([tx.get(query.limit(11)), tx.get(db.doc(`socialPosts/${input.postId}/reactions/${uid}`))]), comments = [];
        const scanned = page.docs.slice(0, 10);
        for (const snapshot of scanned) {
          const item = snapshot.data();
          if (item.id !== snapshot.id || item.deleted || item.moderationState !== "visible") continue;
          if (item.ownerUid !== uid) {
            try { await assertSocialInteraction({ tx, db, uid, targetUid: item.ownerUid }); }
            catch (error) {
              if (error?.message !== "social_unavailable") throw error;
              continue;
            }
          }
          const profile = (await tx.get(db.doc(`publicProfiles/${item.ownerUid}`))).data();
          if (profile?.uid !== item.ownerUid) continue;
          const identity = await author(tx, item.ownerUid);
          comments.push(commentDto(item, identity));
        }
        const boundary = scanned.at(-1);
        return { ...summary(row, reaction.data()), comments, nextCursor: page.size > 10 ? cursors.encode(`${boundary.data().createdAt}_${boundary.id}`, context) : null };
      });
    },
  };
}
