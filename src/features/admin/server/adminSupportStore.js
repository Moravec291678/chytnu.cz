import { randomUUID, createHash } from "node:crypto";
import { activeSupportGrant, safeSupportCatch, safeSupportTrip } from "../supportPolicy.js";
import { adminError } from "./adminValidation.js";
import { summaryForXp } from "../../progression/data/progressionSummary.js";
import { createNotificationRecord } from "../../notifications/data/notificationModel.js";

const check = (valid, code = "support_access_required", status = 403) => { if (!valid) throw adminError(code, status); };
const row = doc => doc.exists ? doc.data() : null;
const rev = value => Number.isSafeInteger(value?.revision) ? value.revision : 0;
const safeInt = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000000;
export const moderationKey = (uid, catchId) => createHash("sha256").update(`${uid}/${catchId}`).digest("hex");

export function createAdminSupportService({ db, auth, ownerUid, actor, permit, transaction, now, at, recent, photoProxy }) {
  const caseRef = id => db.doc(`adminSupportCases/${id}`);
  const grantRef = (uid, id) => db.doc(`users/${uid}/supportGrants/${id}`);
  const balanceRef = uid => db.doc(`users/${uid}/adminProgressionState/summary`);
  const moderationRef = (uid, catchId) => db.doc(`adminPublicModeration/${moderationKey(uid, catchId)}`);
  async function targetAvailable(tx, uid) {
    const [deleted, suspended, account] = await Promise.all([tx.get(db.doc(`accountDeletions/${uid}`)), tx.get(db.doc(`accountSuspensions/${uid}`)), tx.get(db.doc(`adminAccounts/${uid}`))]);
    check(!deleted.exists && !suspended.exists && row(account)?.suspended !== true, "account_unavailable");
  }
  async function grant(tx, identity, input, category) {
    const [supportCase, accessGrant] = await Promise.all([tx.get(caseRef(input.caseId)), tx.get(grantRef(input.uid, input.grantId ?? "missing"))]);
    const c = row(supportCase), g = row(accessGrant);
    check(c?.targetUid === input.uid && !["Closed", "Resolved"].includes(c.status) && c.assignedTo === identity.uid);
    check(activeSupportGrant(g, { uid: input.uid, actorUid: identity.uid, caseId: input.caseId, category, now: now() }));
    await targetAvailable(tx, input.uid);
    return g;
  }
  async function ownList(identity) {
    const [cases, grants, adjustments] = await Promise.all([
      db.collection("adminSupportCases").where("targetUid", "==", identity.uid).limit(50).get(),
      db.collection(`users/${identity.uid}/supportGrants`).orderBy("createdAt", "desc").limit(200).get(),
      db.collection(`users/${identity.uid}/adminProgressionAdjustments`).orderBy("createdAt", "desc").limit(20).get(),
    ]);
    return { cases: cases.docs.map(doc => { const c = doc.data(); return { id: doc.id, category: c.category, description: c.description, status: c.status, createdAt: c.createdAt, updatedAt: c.updatedAt, resolution: c.resolution ?? null }; }),
      grants: grants.docs.map(doc => { const g = doc.data(); return { id: doc.id, caseId: g.caseId, categories: g.categories, expiresAt: g.expiresAt, revokedAt: g.revokedAt ?? null, catchIds: g.catchIds, photoRefs: g.photoRefs, tripIds: g.tripIds }; }),
      adjustments: adjustments.docs.map(doc => { const a = doc.data(); return { id: doc.id, delta: a.delta, reason: a.reason, createdAt: a.createdAt }; }) };
  }
  async function ownMutation(input, identity) {
    return db.runTransaction(async tx => {
      await actor(identity.uid, tx);
      const auditRef = db.doc(`adminAudit/${randomUUID()}`);
      const audit = action => tx.set(auditRef, { actorUid: identity.uid, actorRole: "USER", target: identity.uid, action, createdAt: at(), changedFields: [] });
      if (input.action === "support.revoke") {
        const ref = grantRef(identity.uid, input.grantId), current = row(await tx.get(ref));
        check(current?.ownerId === identity.uid, "not_found", 404);
        tx.set(ref, { ...current, revokedAt: current.revokedAt ?? at() }); audit("support.grant.revoke"); return { revoked: true };
      }
      const rateRef = db.doc(`serverRateLimits/support-${identity.uid}`), rate = row(await tx.get(rateRef));
      const day = Math.floor(now() / 86400000), used = rate?.day === day ? rate.count : 0;
      check(Number.isInteger(used) && used >= 0 && used < 30, "support_daily_limit", 429);
      if (input.action === "support.open") {
        check(Boolean(ownerUid), "support_unavailable", 503);
        check(!(await auth.getUser(ownerUid)).disabled, "support_unavailable", 503);
        const assignee = await actor(ownerUid, tx); permit(assignee, "support");
        const id = randomUUID();
        tx.set(caseRef(id), { id, targetUid: identity.uid, assignedTo: ownerUid, category: input.category, description: input.description, status: "New", priority: "normal", revision: 1, createdAt: at(), updatedAt: at(), resolution: null });
        tx.set(rateRef, { day, count: used + 1 }); audit("support.case.open"); return { caseId: id };
      }
      const c = row(await tx.get(caseRef(input.caseId)));
      check(c?.targetUid === identity.uid && !["Closed", "Resolved"].includes(c.status));
      const recipient = await actor(c.assignedTo, tx); permit(recipient, "support");
      check(!(await auth.getUser(c.assignedTo)).disabled, "support_unavailable", 503);
      // Only existing records owned by the consenting account can be selected.
      const selected = [...input.catchIds.map(id => [`catches/${id}`, "catch"]), ...input.tripIds.map(id => [`trips/${id}`, "trip"]),
        ...input.photoRefs.flatMap(p => [[`catches/${p.catchId}`, "catch"], [`catches/${p.catchId}/photos/${p.photoId}`, "photo"]])];
      const docs = await Promise.all(selected.map(([path]) => tx.get(db.doc(`users/${identity.uid}/${path}`))));
      check(docs.every(doc => doc.exists && doc.data().ownerId === identity.uid && !doc.data().deleted), "invalid_selection", 400);
      for (const photo of input.photoRefs) {
        const parent = docs[selected.findIndex(([path]) => path === `catches/${photo.catchId}`)]?.data();
        check(parent?.photoRefs?.[photo.photoId] === true, "invalid_selection", 400);
      }
      const id = randomUUID();
      const snapshot = Object.fromEntries(Object.entries(input.snapshot).filter(([key]) => key === "sync" ? input.categories.includes("sync") : input.categories.includes("progression")));
      tx.set(grantRef(identity.uid, id), { id, ownerId: identity.uid, caseId: c.id, granteeUid: c.assignedTo, categories: [...new Set(input.categories)], catchIds: input.catchIds, tripIds: input.tripIds, photoRefs: input.photoRefs,
        createdAt: at(), expiresAt: new Date(now() + input.hours * 3600000).toISOString(), revokedAt: null, snapshot, snapshotSource: "user_reported" });
      tx.set(rateRef, { day, count: used + 1 }); audit("support.grant.create"); return { grantId: id };
    });
  }
  async function cases(input, identity) {
    return transaction(identity, "support", async (tx, access, audit) => {
      const [docs, grants, notes] = await Promise.all([tx.get(db.collection("adminSupportCases").where("targetUid", "==", input.uid).limit(50)), tx.get(db.collection(`users/${input.uid}/supportGrants`).orderBy("createdAt", "desc").limit(50)), tx.get(db.collection("adminSupportNotes").where("targetUid", "==", input.uid).limit(50))]);
      const visible = docs.docs.filter(doc => access.role === "OWNER" || doc.data().assignedTo === identity.uid);
      const ids = new Set(visible.map(doc => doc.id));
      audit("support.cases.read", input.uid);
      return { cases: visible.map(doc => ({ ...doc.data(), id: doc.id })), notes: notes.docs.filter(doc => ids.has(doc.data().caseId)).map(doc => ({ id: doc.id, ...doc.data() })), grants: grants.docs.filter(doc => ids.has(doc.data().caseId)).map(doc => { const g = doc.data(); return { id: doc.id, caseId: g.caseId, categories: g.categories, expiresAt: g.expiresAt, revokedAt: g.revokedAt, assignedToCurrentActor: g.granteeUid === identity.uid }; }) };
    });
  }
  async function saveCase(input, identity) {
    return transaction(identity, "support", async (tx, access, audit) => {
      const current = row(await tx.get(caseRef(input.caseId)));
      check(current?.targetUid === input.uid, "not_found", 404); check(rev(current) === input.expectedRevision, "revision_conflict", 409);
      const recipient = input.assignedTo ?? current.assignedTo;
      const recipientAccess = await actor(recipient, tx); permit(recipientAccess, "support"); permit(recipientAccess, "users.read");
      check(!(await auth.getUser(recipient)).disabled, "support_unavailable", 503);
      // Delegated support staff cannot take over another staff member's case.
      check(access.role === "OWNER" || current.assignedTo === identity.uid && recipient === identity.uid, "forbidden");
      const updated = { ...current, assignedTo: recipient, status: input.status, priority: input.priority, resolution: input.resolution || null, revision: rev(current) + 1, updatedAt: at() };
      tx.set(caseRef(input.caseId), updated);
      if (input.note) tx.set(db.doc(`adminSupportNotes/${randomUUID()}`), { caseId: input.caseId, targetUid: input.uid, text: input.note, actorUid: identity.uid, createdAt: at() });
      audit("support.case.update", input.uid, ["status", "priority", "resolution", ...(input.note ? ["note"] : [])]); return { case: updated };
    });
  }
  async function progression(tx, uid, g) {
    const [summary, balance] = await Promise.all([tx.get(db.doc(`users/${uid}/serverProgressionState/summary`)), tx.get(balanceRef(uid))]);
    const s = row(summary), b = row(balance);
    const canonical = s && safeInt(s.legacyBaselineXp) && safeInt(s.serverEventXp) ? s.legacyBaselineXp + s.serverEventXp : null;
    const baseXp = canonical ?? (safeInt(g?.snapshot?.baseXp) ? g.snapshot.baseXp : null);
    const delta = Number.isSafeInteger(b?.adjustmentXp) ? b.adjustmentXp : 0;
    return { baseXp, adjustmentXp: delta, revision: rev(b), source: canonical !== null ? "server_reconciled" : g?.snapshot?.baseXp !== undefined ? "user_reported" : "unavailable",
      observedAt: g?.createdAt ?? null, summary: baseXp === null ? null : summaryForXp(Math.max(0, baseXp + delta)),
      achievements: g?.snapshot?.achievements ?? null, challenges: g?.snapshot?.challenges ?? null, mastery: g?.snapshot?.mastery ?? null, rewards: g?.snapshot?.rewards ?? null, streak: g?.snapshot?.streak ?? null };
  }
  async function content(input, identity) {
    return transaction(identity, "support", async (tx, access, audit) => {
      const g = await grant(tx, identity, input, input.category);
      let result;
      if (input.category === "progression") result = await progression(tx, input.uid, g);
      else if (input.category === "sync") result = { source: "user_reported", observedAt: g.createdAt, diagnostics: g.snapshot?.sync ?? null };
      else if (input.category === "profile") result = { source: "grant", accountAvailable: true, gpsExcluded: true };
      else {
        const selections = input.category === "trips" ? g.tripIds.map(id => `trips/${id}`) : input.category === "photos" ? g.photoRefs.map(p => `catches/${p.catchId}/photos/${p.photoId}`) : g.catchIds.map(id => `catches/${id}`);
        const docs = await Promise.all(selections.map(path => tx.get(db.doc(`users/${input.uid}/${path}`))));
        const parents = input.category === "photos" ? await Promise.all(g.photoRefs.map(photo => tx.get(db.doc(`users/${input.uid}/catches/${photo.catchId}`)))) : [];
        result = { records: docs.filter((doc, index) => doc.exists && doc.data().ownerId === input.uid && !doc.data().deleted && (input.category !== "photos" || parents[index].exists && !parents[index].data().deleted && parents[index].data().ownerId === input.uid && parents[index].data().photoRefs?.[doc.id] === true)).map(doc => input.category === "trips" ? safeSupportTrip(doc.data()) : input.category === "photos" ? { id: doc.id, catchId: doc.data().catchId, state: doc.data().cloud?.state ?? "unavailable", type: doc.data().type } : safeSupportCatch(doc.data())) };
      }
      audit("support.private.read", input.uid, [input.category, input.caseId, input.grantId]);
      return { ...result, supportAccess: { caseId: input.caseId, grantId: input.grantId, expiresAt: g.expiresAt, category: input.category }, gpsExcluded: true };
    });
  }
  async function publicContent(input, identity) {
    return transaction(identity, "users.read", async (tx, access, audit) => {
      await targetAvailable(tx, input.uid);
      let query = db.collection(`users/${input.uid}/catches`).where("privacy.visibility", "==", "public").orderBy("__name__");
      if (input.cursor) query = query.startAfter(input.cursor);
      const docs = await tx.get(query.limit(21));
      const page = docs.docs.slice(0, 20), moderation = await Promise.all(page.map(doc => tx.get(moderationRef(input.uid, doc.id))));
      const records = page.flatMap((doc, index) => {
        const c = doc.data(); if (c.deleted || c.ownerId !== input.uid) return [];
        if (row(moderation[index])?.hidden && access.role !== "OWNER" && !access.permissions.includes("moderation")) return [];
        return [{ ...safeSupportCatch(c), publicPhotos: c.privacy?.photoVisibility === "public" ? Object.keys(c.photoRefs ?? {}).filter(id => c.photoRefs[id] === true).slice(0, 4) : [], moderation: row(moderation[index]) ?? { hidden: false, revision: 0 } }];
      });
      audit("support.public.read", input.uid);
      return { records, nextCursor: docs.docs.length > 20 ? page.at(-1)?.id : null, source: "public", scope: "page", gpsExcluded: true };
    });
  }
  async function adjust(input, identity) {
    recent(identity, now());
    return transaction(identity, "owner", async (tx, access, audit) => {
      const g = await grant(tx, identity, input, "progression"), p = await progression(tx, input.uid, g);
      check(p.baseXp !== null, "progression_unavailable", 409);
      const after = Math.max(0, p.baseXp + p.adjustmentXp + input.delta);
      if (input.action === "progression.preview") {
        check(Math.abs(p.adjustmentXp + input.delta) <= 1000000 && p.baseXp + p.adjustmentXp + input.delta >= 0 && after <= 1000000000, "invalid_adjustment", 400);
        audit("support.private.read", input.uid, ["progression.preview", input.caseId]); return { ...p, after, delta: input.delta };
      }
      const eventRef = db.doc(`users/${input.uid}/adminProgressionAdjustments/${input.operationId}`), existing = row(await tx.get(eventRef));
      if (existing) { check(existing.delta === input.delta && existing.reason === input.reason && existing.actorUid === identity.uid && existing.caseId === input.caseId, "idempotency_conflict", 409); audit("progression.adjust.replay", input.uid); return { adjustment: existing }; }
      check(p.revision === input.expectedRevision && p.baseXp === input.expectedBaseXp, "revision_conflict", 409);
      check(Math.abs(p.adjustmentXp + input.delta) <= 1000000 && p.baseXp + p.adjustmentXp + input.delta >= 0 && after <= 1000000000, "invalid_adjustment", 400);
      const adjustment = { id: input.operationId, ownerId: input.uid, actorUid: identity.uid, caseId: input.caseId, reason: input.reason, delta: input.delta, before: p.summary.xp, after, baseSource: p.source, createdAt: at() };
      tx.set(eventRef, adjustment); tx.set(balanceRef(input.uid), { ownerId: input.uid, adjustmentXp: p.adjustmentXp + input.delta, revision: p.revision + 1, updatedAt: at() });
      const notification = createNotificationRecord({ id: `support_${input.operationId}`, type: "support", title: "Podpora provedla opravu XP", body: `${input.delta > 0 ? "+" : ""}${input.delta} XP. Důvod: ${input.reason.slice(0,200)}`, deepLink: "/privacy" }, { ownerId: input.uid, scopeKey: `account:${input.uid}` }, { now: new Date(now()) });
      tx.set(db.doc(`users/${input.uid}/notifications/${notification.id}`), notification);
      audit("progression.adjust", input.uid, [input.operationId, input.caseId]); return { adjustment };
    });
  }
  async function photo(input, identity) {
    const authorize = () => transaction(identity, input.grantId ? "support" : "users.read", async (tx, access, audit) => {
      let g = null;
      if (input.grantId) { g = await grant(tx, identity, input, "photos"); check(g.photoRefs.some(p => p.catchId === input.catchId && p.photoId === input.photoId)); }
      else await targetAvailable(tx, input.uid);
      const rateRef = db.doc(`serverRateLimits/admin-photo-${identity.uid}`);
      const [parent, image, moderation, rate] = await Promise.all([tx.get(db.doc(`users/${input.uid}/catches/${input.catchId}`)), tx.get(db.doc(`users/${input.uid}/catches/${input.catchId}/photos/${input.photoId}`)), tx.get(moderationRef(input.uid, input.catchId)), tx.get(rateRef)]);
      const c = row(parent), p = row(image);
      check(c?.ownerId === input.uid && !c.deleted && c.photoRefs?.[input.photoId] === true && p?.ownerId === input.uid && !p.deleted, "photo_unavailable", 404);
      if (!g) check(c.privacy?.visibility === "public" && c.privacy?.photoVisibility === "public" && (!row(moderation)?.hidden || access.role === "OWNER" || access.permissions.includes("moderation")));
      const minute = Math.floor(now() / 60000), used = row(rate)?.minute === minute ? row(rate).used : 0;
      check(Number.isInteger(used) && used >= 0 && used < 120, "photo_rate_limited", 429);
      tx.set(rateRef, { minute, used: used + 1 });
      audit(g ? "support.private.photo.read" : "support.public.photo.read", input.uid, [input.catchId, input.photoId, ...(g ? [input.caseId, input.grantId] : [])]);
      return p;
    });
    const image = await authorize(); check(typeof photoProxy === "function", "photo_unavailable", 503);
    const bytes = await photoProxy(input, image);
    await authorize(); // Revocation during download must stop delivery.
    return bytes;
  }
  async function moderate(input, identity) {
    return transaction(identity, "moderation", async (tx, access, audit) => {
      const [record, current] = await Promise.all([tx.get(db.doc(`users/${input.uid}/catches/${input.catchId}`)), tx.get(moderationRef(input.uid, input.catchId))]);
      check(record.exists && !record.data().deleted && record.data().privacy?.visibility === "public", "public_content_required", 400);
      const previous = row(current); check(rev(previous) === input.expectedRevision, "revision_conflict", 409);
      tx.set(moderationRef(input.uid, input.catchId), { targetUid: input.uid, catchId: input.catchId, hidden: input.hidden, reason: input.reason, revision: rev(previous) + 1, updatedAt: at(), actorUid: identity.uid });
      const notification = createNotificationRecord({ id: `support_${randomUUID()}`, type: "support", title: input.hidden ? "Veřejné zobrazení úlovku bylo skryté" : "Veřejné zobrazení úlovku bylo obnovené", body: `Důvod: ${input.reason.slice(0, 200)}. Osobní záznam ani fotografie nebyly smazány.`, deepLink: "/privacy" }, { ownerId: input.uid, scopeKey: `account:${input.uid}` }, { now: new Date(now()) });
      tx.set(db.doc(`users/${input.uid}/notifications/${notification.id}`), notification);
      audit(input.hidden ? "moderation.hide" : "moderation.restore", input.uid, [input.catchId]); return { hidden: input.hidden };
    });
  }
  return { async execute(input, identity) {
    if (input.action === "support.own") return ownList(identity);
    if (input.action === "moderation.own") {
      const docs = await db.collection("adminPublicModeration").where("targetUid", "==", identity.uid).limit(200).get();
      return { records: docs.docs.map(doc => { const m = doc.data(); return { catchId: m.catchId, hidden: m.hidden === true, reason: m.reason, updatedAt: m.updatedAt }; }) };
    }
    if (["support.open", "support.grant", "support.revoke"].includes(input.action)) return ownMutation(input, identity);
    if (input.action === "progression.self") {
      const state = row(await balanceRef(identity.uid).get()); return { adjustmentXp: Number.isSafeInteger(state?.adjustmentXp) ? state.adjustmentXp : 0, revision: rev(state) };
    }
    if (input.action === "support.cases") return cases(input, identity);
    if (input.action === "support.case.open") {
      await auth.getUser(input.uid);
      return transaction(identity, "support", async (tx, access, audit) => {
        permit(access, "users.read");
        const deleted = await tx.get(db.doc(`accountDeletions/${input.uid}`)); check(!deleted.exists, "account_unavailable");
        const id = randomUUID();
        tx.set(caseRef(id), { id, targetUid: input.uid, assignedTo: identity.uid, category: input.category, description: input.description, status: "New", priority: "normal", revision: 1, createdAt: at(), updatedAt: at(), resolution: null });
        audit("support.case.create", input.uid, [id]); return { caseId: id };
      });
    }
    if (input.action === "support.case.save") return saveCase(input, identity);
    if (input.action === "support.content") return content(input, identity);
    if (input.action === "support.photo") return photo(input, identity);
    if (input.action === "users.public") return publicContent(input, identity);
    if (["progression.preview", "progression.adjust"].includes(input.action)) return adjust(input, identity);
    if (input.action === "moderation.set") return moderate(input, identity);
    if (input.action === "users.history") {
      return transaction(identity, "users.read", async (tx, access, audit) => {
        let query = db.collection("adminAudit").where("target", "==", input.uid).orderBy("__name__");
        if (input.cursor) query = query.startAfter(input.cursor);
        const docs = await tx.get(query.limit(51)); audit("support.history.read", input.uid);
        return { entries: docs.docs.slice(0, 50).map(doc => ({ id: doc.id, ...doc.data() })), nextCursor: docs.docs.length > 50 ? docs.docs[49].id : null };
      });
    }
    return null;
  } };
}
