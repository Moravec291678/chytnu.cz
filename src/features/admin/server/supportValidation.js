import { allowedKeys, adminError, validUid, validRevision, optionalText } from "./adminValidation.js";
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from "../supportPolicy.js";

const ids = value => {
  if (!Array.isArray(value) || value.length > 20 || value.some(id => { try { validUid(id); return false; } catch { return true; } })) throw adminError("invalid_selection");
  return [...new Set(value)];
};
const text = (value, max = 2000) => { const result = optionalText(value, max); if (result.length < 3) throw adminError("reason_required"); return result; };
export function validateSupportRequest(body) {
  const fields = {
    "support.own": [], "moderation.own": [], "support.open": ["category", "description"], "support.grant": ["caseId", "categories", "catchIds", "tripIds", "photoRefs", "hours", "snapshot"], "support.revoke": ["grantId"],
    "support.cases": ["uid"], "support.case.open": ["uid", "category", "description"], "support.case.save": ["uid", "caseId", "expectedRevision", "status", "priority", "assignedTo", "note", "resolution"],
    "support.content": ["uid", "caseId", "grantId", "category", "cursor"], "support.photo": ["uid", "caseId", "grantId", "catchId", "photoId"],
    "users.public": ["uid", "cursor"], "users.history": ["uid", "cursor"], "users.index": [],
    "moderation.set": ["uid", "catchId", "hidden", "reason", "expectedRevision"],
    "progression.preview": ["uid", "caseId", "grantId", "delta"], "progression.adjust": ["uid", "caseId", "grantId", "delta", "reason", "operationId", "expectedRevision", "expectedBaseXp"], "progression.self": [],
  };
  if (!Object.hasOwn(fields, body.action)) return null;
  allowedKeys(body, ["action", ...fields[body.action]]);
  const value = { ...body };
  for (const key of ["uid", "caseId", "grantId", "catchId", "photoId", "operationId", "assignedTo"]) if (value[key] !== undefined) validUid(value[key]);
  if (value.cursor !== undefined) validUid(value.cursor);
  if (["support.cases", "support.case.open", "support.case.save", "support.content", "support.photo", "users.public", "users.history", "moderation.set", "progression.preview", "progression.adjust"].includes(value.action)) validUid(value.uid);
  if (["support.grant", "support.case.save", "support.content", "progression.preview", "progression.adjust"].includes(value.action) || value.action === "support.photo" && value.grantId) validUid(value.caseId);
  if (["support.open", "support.case.open"].includes(value.action)) { value.description = text(value.description); value.category = text(value.category, 80); }
  if (value.action === "support.grant") {
    if (!Array.isArray(value.categories) || !value.categories.length || value.categories.length > 6 || value.categories.some(category => !Object.hasOwn(SUPPORT_CATEGORIES, category))) throw adminError("invalid_selection");
    value.catchIds = ids(value.catchIds ?? []); value.tripIds = ids(value.tripIds ?? []);
    if (!Array.isArray(value.photoRefs) || value.photoRefs.length > 40) throw adminError("invalid_selection");
    value.photoRefs = value.photoRefs.map(photo => { allowedKeys(photo, ["catchId", "photoId"]); return { catchId: validUid(photo.catchId), photoId: validUid(photo.photoId) }; });
    if (!Number.isInteger(value.hours) || value.hours < 1 || value.hours > 72) throw adminError("invalid_expiry");
    value.snapshot = validateSupportSnapshot(value.snapshot);
  }
  if (value.action === "support.revoke") validUid(value.grantId);
  if (value.action === "support.case.save") {
    value.expectedRevision = validRevision(value.expectedRevision);
    if (!SUPPORT_STATUSES.includes(value.status) || !["low", "normal", "high"].includes(value.priority)) throw adminError("invalid_status");
    value.note = optionalText(value.note, 2000); value.resolution = optionalText(value.resolution, 2000);
    if (["Resolved", "Closed"].includes(value.status) && !value.resolution) throw adminError("reason_required");
  }
  if (value.action === "support.content" && !Object.hasOwn(SUPPORT_CATEGORIES, value.category)) throw adminError("invalid_category");
  if (["support.photo", "moderation.set"].includes(value.action)) validUid(value.catchId);
  if (value.action === "support.photo") validUid(value.photoId);
  if (value.action === "moderation.set") { if (typeof value.hidden !== "boolean") throw adminError("invalid_status"); value.reason = text(value.reason, 1000); value.expectedRevision = validRevision(value.expectedRevision); }
  if (["progression.preview", "progression.adjust"].includes(value.action) && (!Number.isSafeInteger(value.delta) || !value.delta || Math.abs(value.delta) > 10000)) throw adminError("invalid_adjustment");
  if (value.action === "progression.adjust") {
    validUid(value.operationId); value.reason = text(value.reason, 1000); value.expectedRevision = validRevision(value.expectedRevision);
    if (!Number.isSafeInteger(value.expectedBaseXp) || value.expectedBaseXp < 0 || value.expectedBaseXp > 1000000000) throw adminError("invalid_adjustment");
  }
  return value;
}

export function validateSupportSnapshot(value = {}) {
  // Explicitly user-reported diagnostics, never a new authoritative reward ledger.
  allowedKeys(value, ["baseXp", "achievements", "challenges", "rewards", "mastery", "streak", "sync"]);
  const result = {};
  if (value.baseXp !== undefined) { if (!Number.isSafeInteger(value.baseXp) || value.baseXp < 0 || value.baseXp > 1000000000) throw adminError("invalid_snapshot"); result.baseXp = value.baseXp; }
  for (const key of ["achievements", "challenges", "rewards", "mastery"]) {
    if (value[key] === undefined) continue;
    if (!Array.isArray(value[key]) || value[key].length > 100) throw adminError("invalid_snapshot");
    result[key] = value[key].map(row => {
      allowedKeys(row, ["id", "label", "xp", "completed", "progress", "occurredAt"]);
      const clean = { id: optionalText(row.id, 180), label: optionalText(row.label, 180) };
      for (const number of ["xp", "progress"]) if (row[number] !== undefined) { if (!Number.isFinite(row[number]) || row[number] < 0 || row[number] > 1000000000) throw adminError("invalid_snapshot"); clean[number] = row[number]; }
      if (typeof row.completed === "boolean") clean.completed = row.completed;
      if (row.occurredAt && Number.isFinite(Date.parse(row.occurredAt))) clean.occurredAt = new Date(row.occurredAt).toISOString();
      return clean;
    });
  }
  if (value.streak !== undefined) { if (!Number.isSafeInteger(value.streak) || value.streak < 0 || value.streak > 10000) throw adminError("invalid_snapshot"); result.streak = value.streak; }
  if (value.sync !== undefined) { allowedKeys(value.sync, ["pending", "code"]); if (!Number.isInteger(value.sync.pending) || value.sync.pending < 0 || value.sync.pending > 100000) throw adminError("invalid_snapshot"); result.sync = { pending: value.sync.pending, code: ["unavailable", "offline", "pending", "ok"].includes(value.sync.code) ? value.sync.code : "unavailable" }; }
  return result;
}
