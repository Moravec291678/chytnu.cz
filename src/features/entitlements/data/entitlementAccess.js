import { FEATURES } from "../../../product/config/featureFlags.js";
import { SUPPORTER_CAPABILITIES } from "../../../product/config/supporter.js";

const ENTITLEMENT_STATES = new Set(["active", "grace", "expired", "cancelled"]);

function timestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(result) ? result : Number.NaN;
}

function isServerSnapshot(snapshot) {
  return Boolean(snapshot && snapshot.verified === true && snapshot.source === "server"
    && ENTITLEMENT_STATES.has(snapshot.status) && Array.isArray(snapshot.entitlements));
}

export function hasVerifiedEntitlement(snapshot, entitlementId, { now = Date.now() } = {}) {
  if (!isServerSnapshot(snapshot)) return false;
  const currentTime = timestamp(now);
  const expiresAt = timestamp(snapshot.expiresAt);
  const graceUntil = timestamp(snapshot.graceUntil);
  if (!Number.isFinite(currentTime) || Number.isNaN(expiresAt) || Number.isNaN(graceUntil)) return false;
  if (snapshot.status === "active" && expiresAt !== null && expiresAt <= currentTime) return false;
  if (snapshot.status === "grace" && (graceUntil === null || graceUntil <= currentTime)) return false;
  if (snapshot.status !== "active" && snapshot.status !== "grace") return false;
  return snapshot.entitlements.includes(entitlementId);
}

export function getEntitlementState(snapshot, entitlementId = "supporter", { now = Date.now() } = {}) {
  if (!snapshot) return "unavailable";
  if (!isServerSnapshot(snapshot)) return "unavailable";
  const currentTime = timestamp(now);
  const expiresAt = timestamp(snapshot.expiresAt);
  const graceUntil = timestamp(snapshot.graceUntil);
  if (!Number.isFinite(currentTime) || Number.isNaN(expiresAt) || Number.isNaN(graceUntil)) return "unavailable";
  if (snapshot.status === "cancelled" || snapshot.status === "expired") return snapshot.status;
  if (snapshot.status === "active" && expiresAt !== null && expiresAt <= currentTime) return "expired";
  if (snapshot.status === "grace" && (graceUntil === null || graceUntil <= currentTime)) return "expired";
  if (!snapshot.entitlements.includes(entitlementId)) return "inactive";
  return snapshot.status;
}

/**
 * Client presentation/capability gate. It fails closed and is never an authority
 * for API, Firestore, or server-side access decisions.
 */
export function canUse(capabilityId, snapshot = null, { now = Date.now(), featureFlags = FEATURES } = {}) {
  const capability = SUPPORTER_CAPABILITIES[capabilityId];
  if (!capability || featureFlags.supporter !== true) return false;
  return hasVerifiedEntitlement(snapshot, capability.requiredEntitlement, { now });
}

export function createEntitlementEngine({ snapshot = null, now = Date.now(), featureFlags = FEATURES } = {}) {
  return Object.freeze({
    canUse: (capabilityId) => canUse(capabilityId, snapshot, { now, featureFlags }),
    state: (entitlementId = "supporter") => getEntitlementState(snapshot, entitlementId, { now }),
  });
}

export function getCatchPhotoPreservationLimit(snapshot = null, existingPhotoCount = 0, options = {}) {
  const capability = SUPPORTER_CAPABILITIES["catch.photos.extended"];
  const freeLimit = capability.freeLimit;
  const entitledLimit = canUse("catch.photos.extended", snapshot, options) ? capability.supporterLimit : freeLimit;
  // Existing photos remain part of the record even if the entitlement expires.
  return Math.max(freeLimit, Number.isInteger(existingPhotoCount) ? existingPhotoCount : 0, entitledLimit);
}

export function getCatchPhotoAdditionLimit(snapshot = null, options = {}) {
  const capability = SUPPORTER_CAPABILITIES["catch.photos.extended"];
  return canUse("catch.photos.extended", snapshot, options) ? capability.supporterLimit : capability.freeLimit;
}

export function canAddCatchPhoto(snapshot, currentPhotoCount, options = {}) {
  return Number.isInteger(currentPhotoCount) && currentPhotoCount >= 0
    && currentPhotoCount < getCatchPhotoAdditionLimit(snapshot, options);
}
