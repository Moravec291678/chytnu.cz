export const ADMIN_ROLES = Object.freeze(["OWNER", "ADMIN", "TESTER", "USER"]);
export const ADMIN_PERMISSIONS = Object.freeze(["users.read", "users.manage", "tasks", "audit", "monitoring"]);
export const RUNTIME_FEATURES = Object.freeze(["species", "diary", "recommendations", "stories"]);
export const FEATURE_AUDIENCES = Object.freeze(["everyone", "testers", "owner", "selected", "disabled"]);
export const ADMIN_LIMIT_BOUNDS = Object.freeze({ userDailyReservation: 5000, testerDailyReservation: 5000, globalDailyReservation: 7500, textDailyReservation: 1000 });
export const validAdminUid = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const object = value => value && typeof value === "object" && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const reservation = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;

export function normalizeAdminPermissions(value = []) {
  if (!Array.isArray(value) || value.length > ADMIN_PERMISSIONS.length || value.some(item => !ADMIN_PERMISSIONS.includes(item))) throw new TypeError("Neplatná oprávnění administrátora.");
  return [...new Set(value)];
}

export function normalizeAccountLimits(value = {}) {
  if (!keys(value, ["dailyReservation"]) || (value.dailyReservation != null && !reservation(value.dailyReservation, 5000))) throw new TypeError("Neplatný individuální limit.");
  return value.dailyReservation == null ? {} : { dailyReservation: value.dailyReservation };
}

export function normalizeFeatureEntitlements(value = {}) {
  if (!keys(value, RUNTIME_FEATURES) || Object.values(value).some(item => typeof item !== "boolean")) throw new TypeError("Neplatná oprávnění funkcí.");
  return { ...value };
}

export function normalizeRuntimeConfig(value = {}) {
  if (!keys(value, ["revision", "updatedAt", "updatedBy", "limits", "features"])) throw new TypeError("Neplatná provozní konfigurace.");
  if (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || value.revision < 0)) throw new TypeError("Neplatná revize konfigurace.");
  if (value.limits !== undefined && !keys(value.limits, Object.keys(ADMIN_LIMIT_BOUNDS))) throw new TypeError("Neplatné limity.");
  const limits = { ...ADMIN_LIMIT_BOUNDS, ...value.limits };
  for (const [key, max] of Object.entries(ADMIN_LIMIT_BOUNDS)) if (!reservation(limits[key], max)) throw new TypeError("Bezpečný bezplatný limit nelze překročit.");
  if (value.features !== undefined && !keys(value.features, RUNTIME_FEATURES)) throw new TypeError("Neplatné funkce.");
  const features = Object.fromEntries(RUNTIME_FEATURES.map(key => {
    const feature = value.features?.[key] ?? { audience: "everyone", userIds: [] };
    if (!keys(feature, ["audience", "userIds"]) || !FEATURE_AUDIENCES.includes(feature.audience)
      || !Array.isArray(feature.userIds ?? []) || (feature.userIds?.length ?? 0) > 100 || (feature.userIds ?? []).some(uid => !validAdminUid(uid))) throw new TypeError("Neplatné publikum funkce.");
    return [key, { audience: feature.audience, userIds: [...new Set(feature.userIds ?? [])] }];
  }));
  return { revision: value.revision ?? 0, limits, features,
    ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}),
    ...(validAdminUid(value.updatedBy) ? { updatedBy: value.updatedBy } : {}) };
}

export function resolveAccess(uid, account = {}, ownerUid = "", now = Date.now()) {
  if (!validAdminUid(uid)) throw new TypeError("Neplatná identita účtu.");
  const role = validAdminUid(ownerUid) && uid === ownerUid ? "OWNER" : ["ADMIN", "TESTER", "USER"].includes(account?.role) ? account.role : "USER";
  const suspended = account?.suspended === true;
  const expires = account?.overrideExpiresAt;
  const overrideActive = expires == null || (typeof expires === "string" && Number.isFinite(Date.parse(expires)) && Date.parse(expires) > now);
  return { uid, role, suspended, permissions: role === "OWNER" ? [...ADMIN_PERMISSIONS] : role === "ADMIN" ? normalizeAdminPermissions(account?.permissions ?? []) : [],
    internalLimitExempt: role === "OWNER", revision: Number.isSafeInteger(account?.revision) ? account.revision : 0,
    limits: overrideActive ? normalizeAccountLimits(account?.limits ?? {}) : {},
    entitlements: overrideActive ? normalizeFeatureEntitlements(account?.entitlements ?? {}) : {},
    overrideExpiresAt: expires ?? null };
}

export function hasAdminPermission(access, permission) {
  return Boolean(access && !access.suspended && (access.role === "OWNER" || (access.role === "ADMIN" && access.permissions?.includes(permission))));
}

export function effectiveUserReservation(access, config) {
  if (access.suspended) return 0;
  if (access.internalLimitExempt) return null;
  return access.limits?.dailyReservation ?? (access.role === "TESTER" ? config.limits.testerDailyReservation : config.limits.userDailyReservation);
}

export function isRuntimeFeatureEnabled(capability, access, config) {
  const feature = config.features?.[capability];
  if (!feature || feature.audience === "disabled" || access.suspended) return false;
  if (access.role === "OWNER") return true;
  if (feature.audience === "owner") return false;
  if (typeof access.entitlements?.[capability] === "boolean") return access.entitlements[capability];
  return feature.audience === "everyone" || (feature.audience === "testers" && access.role === "TESTER")
    || (feature.audience === "selected" && feature.userIds.includes(access.uid));
}
