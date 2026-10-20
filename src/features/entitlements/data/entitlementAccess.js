/**
 * Client-side entitlement gate. Only an explicitly server-verified snapshot can
 * unlock paid features; feature flags and locally stored values are not grants.
 */
export function hasVerifiedEntitlement(snapshot, entitlementId) {
  if (!snapshot || snapshot.verified !== true || snapshot.source !== "server") return false;
  if (snapshot.status !== "active" || !Array.isArray(snapshot.entitlements)) return false;
  return snapshot.entitlements.includes(entitlementId);
}

export function getEntitlementState(snapshot, entitlementId) {
  if (!snapshot) return "unavailable";
  return hasVerifiedEntitlement(snapshot, entitlementId) ? "active" : "inactive";
}
