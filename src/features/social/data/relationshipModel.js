import { canonicalPair, socialUid } from "./socialModel.js";

const TERMINAL = ["rejected", "cancelled", "unfriended"];
const STATES = ["pending", "accepted", ...TERMINAL, "blocked"];
const COOLDOWN_MS = 24 * 60 * 60_000;
const fail = (code = "invalid_request") => { throw Object.assign(new Error(code), { code }); };
const validRevision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;

function validateRecord(record, uid, targetUid) {
  if (!record) return 0;
  if (!Array.isArray(record.memberUids) || record.memberUids.length !== 2 || new Set(record.memberUids).size !== 2
    || !record.memberUids.includes(uid) || !record.memberUids.includes(targetUid)
    || !record.memberUids.includes(record.requestedBy) || !STATES.includes(record.status)
    || record.lastActorUid !== undefined && !record.memberUids.includes(record.lastActorUid)
    || !Number.isSafeInteger(record.createdAt) || record.createdAt < 0
    || !Number.isSafeInteger(record.updatedAt) || record.updatedAt < record.createdAt) return fail();
  const revision = record.revision ?? 0;
  if (!validRevision(revision)) return fail();
  return revision;
}

export function relationshipView(record, viewerUid, { blocked = false, canRequest = false } = {}) {
  const none = { status: "none", revision: 0, canRequest: false };
  try { socialUid(viewerUid); } catch { return none; }
  if (!record) return { ...none, status: blocked ? "blocked" : "none", canRequest: !blocked && canRequest === true };
  const targetUid = record.memberUids?.find(uid => uid !== viewerUid);
  try { socialUid(targetUid); validateRecord(record, viewerUid, targetUid); } catch { return none; }
  const status = blocked || record.status === "blocked" ? "blocked" : record.status === "accepted" ? "friends"
    : record.status === "pending" ? record.requestedBy === viewerUid ? "outgoing" : "incoming" : record.status;
  return { status, revision: record.revision ?? 0, canRequest: TERMINAL.includes(status) && canRequest === true };
}

export function transitionRelationship({ record = null, uid, targetUid, operation, now = Date.now(), operationId, expectedRevision } = {}) {
  try { canonicalPair(uid, targetUid); } catch { return fail(); }
  if (!Number.isSafeInteger(now) || now < 0 || !["request", "accept", "reject", "cancel", "unfriend", "remove"].includes(operation)
    || operationId !== undefined && (typeof operationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(operationId))
    || expectedRevision !== undefined && !validRevision(expectedRevision)) return fail();
  const revision = validateRecord(record, uid, targetUid);
  if (record?.updatedAt > now) return fail("relationship_conflict");
  if (record?.status === "blocked") return fail("relationship_conflict");
  let action = operation;
  if (action === "remove") action = record?.status === "pending" ? record.requestedBy === uid ? "cancel" : "reject"
    : record?.status === "accepted" ? "unfriend" : record?.status === "rejected" ? "reject"
      : record?.status === "cancelled" ? "cancel" : record?.status === "unfriended" ? "unfriend" : "remove";
  // Actor checks happen before idempotency: the requester cannot accept/reject
  // their own request, including a stale replay after the recipient accepted.
  if (["accept", "reject"].includes(action) && record?.requestedBy === uid) return fail();
  if (action === "cancel" && record?.requestedBy !== uid) return fail();
  const fulfilledStatus = { request: "pending", accept: "accepted", reject: "rejected", cancel: "cancelled", unfriend: "unfriended" }[action];
  const lastActor = record?.lastActorUid ?? (record?.status === "pending" ? record.requestedBy
    : record?.status === "accepted" ? record.memberUids.find(member => member !== record.requestedBy) : null);
  const ownReplay = Boolean(record && record.status === fulfilledStatus && lastActor === uid);
  if (expectedRevision !== undefined && expectedRevision !== revision && !ownReplay) return fail("relationship_conflict");
  const unchanged = () => ({ record: record ? structuredClone(record) : null, changed: false, eventType: null });
  if (ownReplay) return unchanged();
  if (action === "request") {
    if (record && ["pending", "accepted"].includes(record.status)) return unchanged();
    if (record && !operationId) return fail("relationship_conflict");
    if (record?.status === "rejected" && now - record.updatedAt < COOLDOWN_MS) return fail("relationship_conflict");
  } else if (action === "accept") {
    if (record?.status === "accepted") return unchanged();
    if (record?.status !== "pending") return fail();
  } else if (action === "reject" || action === "cancel") {
    if (record?.status !== "pending") return fail();
  } else if (action === "unfriend") {
    if (record?.status !== "accepted") return fail();
  } else if (action === "remove" && !record) return unchanged();
  else return fail();
  const status = { request: "pending", accept: "accepted", reject: "rejected", cancel: "cancelled", unfriend: "unfriended" }[action];
  return { record: { memberUids: [uid, targetUid].sort(), requestedBy: action === "request" ? uid : record.requestedBy,
    status, revision: revision + 1, createdAt: record?.createdAt ?? now, updatedAt: now, lastActorUid: uid }, changed: true,
  eventType: action === "request" ? "requested" : action === "accept" ? "accepted" : action === "unfriend" ? "removed" : null };
}
