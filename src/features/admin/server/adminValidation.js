import { validAdminUid, normalizeAdminPermissions, normalizeAccountLimits, normalizeFeatureEntitlements, normalizeRuntimeConfig } from "../adminPolicy.js";

export const TASK_CATEGORIES = Object.freeze(["Bug", "Feature", "Improvement", "Design", "Security", "Maintenance"]);
export const TASK_STATUSES = Object.freeze(["New", "Planned", "In Progress", "Testing", "Done", "Cancelled"]);
export const TASK_PRIORITIES = Object.freeze(["low", "normal", "high", "critical"]);
export const adminError = (code, status = 400) => Object.assign(new Error(code), { code, status });
const object = value => value && typeof value === "object" && !Array.isArray(value);
export function allowedKeys(value, fields) {
  if (!object(value) || Object.keys(value).some(key => !fields.includes(key))) throw adminError("invalid_request");
  return value;
}
export function validRevision(value, { optional = false } = {}) {
  if (optional && value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) throw adminError("invalid_revision");
  return value;
}
export function validUid(value) {
  if (!validAdminUid(value)) throw adminError("invalid_uid");
  return value;
}
export function optionalText(value, max = 160) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max) throw adminError("invalid_request");
  return value.trim();
}
export function normalizeTask(value) {
  allowedKeys(value, ["title", "description", "category", "priority", "status", "dueAt"]);
  const title = optionalText(value.title, 160), description = optionalText(value.description, 4000);
  if (!title || !TASK_CATEGORIES.includes(value.category) || !TASK_PRIORITIES.includes(value.priority)
    || !TASK_STATUSES.includes(value.status)) throw adminError("invalid_task");
  let dueAt = null;
  if (value.dueAt != null && value.dueAt !== "") {
    const raw = optionalText(value.dueAt, 40);
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(raw) || !Number.isFinite(Date.parse(raw))) throw adminError("invalid_due_date");
    dueAt = new Date(raw).toISOString();
    if (dueAt.slice(0, 10) !== raw.slice(0, 10)) throw adminError("invalid_due_date");
  }
  return { title, description, category: value.category, priority: value.priority, status: value.status, dueAt };
}
export function normalizeAccountPatch(value) {
  allowedKeys(value, ["role", "permissions", "suspended", "limits", "entitlements", "overrideExpiresAt"]);
  if (!Object.keys(value).length) throw adminError("empty_patch");
  const patch = {};
  if (value.role !== undefined) {
    if (!["USER", "TESTER", "ADMIN"].includes(value.role)) throw adminError("invalid_role");
    patch.role = value.role;
  }
  if (value.suspended !== undefined) {
    if (typeof value.suspended !== "boolean") throw adminError("invalid_status");
    patch.suspended = value.suspended;
  }
  try {
    if (value.permissions !== undefined) patch.permissions = normalizeAdminPermissions(value.permissions);
    if (value.limits !== undefined) patch.limits = normalizeAccountLimits(value.limits);
    if (value.entitlements !== undefined) patch.entitlements = normalizeFeatureEntitlements(value.entitlements);
  } catch { throw adminError("invalid_account_policy"); }
  if (Object.hasOwn(value, "overrideExpiresAt")) {
    if (value.overrideExpiresAt !== null && (typeof value.overrideExpiresAt !== "string" || value.overrideExpiresAt.length > 40 || !Number.isFinite(Date.parse(value.overrideExpiresAt)))) throw adminError("invalid_expiry");
    patch.overrideExpiresAt = value.overrideExpiresAt === null ? null : new Date(value.overrideExpiresAt).toISOString();
  }
  return patch;
}
export function normalizeConfigPatch(value) {
  allowedKeys(value, ["limits", "features"]);
  if (!Object.keys(value).length) throw adminError("empty_patch");
  try { normalizeRuntimeConfig(value); } catch { throw adminError("invalid_config"); }
  return structuredClone(value);
}

const ACTION_FIELDS = Object.freeze({ self: [], overview: [], "users.list": ["cursor", "search", "role", "status"], "users.get": ["uid"],
  "users.update": ["uid", "patch", "expectedRevision"], "config.get": [], "config.update": ["patch", "expectedRevision"],
  "tasks.list": ["cursor", "search", "status", "category"], "tasks.save": ["id", "task", "expectedRevision"],
  "tasks.delete": ["id", "expectedRevision"], "audit.list": ["cursor"], monitoring: [] });
export function validateAdminRequest(body) {
  if (!object(body) || typeof body.action !== "string" || !Object.hasOwn(ACTION_FIELDS, body.action)) throw adminError("invalid_action");
  allowedKeys(body, ["action", ...ACTION_FIELDS[body.action]]);
  const request = { ...body };
  if (request.cursor !== undefined && (typeof request.cursor !== "string" || request.cursor.length > 4096)) throw adminError("invalid_cursor");
  if (request.search !== undefined) request.search = optionalText(request.search, 160);
  if (request.uid !== undefined) validUid(request.uid);
  if (request.id !== undefined) validUid(request.id);
  if (body.action === "users.list") {
    if (request.role && !["OWNER", "ADMIN", "TESTER", "USER"].includes(request.role)) throw adminError("invalid_role");
    if (request.status && !["active", "suspended"].includes(request.status)) throw adminError("invalid_status");
  }
  if (body.action === "tasks.list") {
    if (request.status && !TASK_STATUSES.includes(request.status)) throw adminError("invalid_status");
    if (request.category && !TASK_CATEGORIES.includes(request.category)) throw adminError("invalid_category");
  }
  if (["users.get", "users.update"].includes(body.action)) validUid(request.uid);
  if (body.action === "users.update") request.patch = normalizeAccountPatch(request.patch);
  if (body.action === "config.update") request.patch = normalizeConfigPatch(request.patch);
  if (body.action === "tasks.save") request.task = normalizeTask(request.task);
  if (body.action === "tasks.delete") validUid(request.id);
  if (["users.update", "config.update", "tasks.save", "tasks.delete"].includes(body.action)) request.expectedRevision = validRevision(request.expectedRevision, { optional: body.action === "tasks.save" && !request.id });
  return request;
}
