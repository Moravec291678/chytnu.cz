export const GUEST_SCOPE_PREFIX = "guest:";
export const ACCOUNT_SCOPE_PREFIX = "account:";

export function accountScopeKey(ownerId) {
  if (typeof ownerId !== "string" || !ownerId.trim()) {
    throw new TypeError("Účetní scope vyžaduje platné ID uživatele.");
  }
  return `${ACCOUNT_SCOPE_PREFIX}${ownerId.trim()}`;
}

export function createGuestScopeKey() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Toto zařízení neumí vytvořit bezpečný místní profil.");
  }
  return `${GUEST_SCOPE_PREFIX}${crypto.randomUUID()}`;
}

export function isGuestScope(scopeKey) {
  return typeof scopeKey === "string" && scopeKey.startsWith(GUEST_SCOPE_PREFIX)
    && scopeKey.length > GUEST_SCOPE_PREFIX.length;
}

export function isAccountScope(scopeKey) {
  return typeof scopeKey === "string" && scopeKey.startsWith(ACCOUNT_SCOPE_PREFIX)
    && scopeKey.length > ACCOUNT_SCOPE_PREFIX.length;
}

export function ownerIdFromScope(scopeKey) {
  return isAccountScope(scopeKey) ? scopeKey.slice(ACCOUNT_SCOPE_PREFIX.length) : null;
}

export function validateDataScope({ scopeKey, ownerId = null }) {
  if (!isGuestScope(scopeKey) && !isAccountScope(scopeKey)) {
    throw new TypeError("Datový scope není platný.");
  }
  const scopedOwnerId = ownerIdFromScope(scopeKey);
  if (scopedOwnerId !== (ownerId ?? null)) {
    throw new Error("Datový scope neodpovídá přihlášenému účtu.");
  }
  return { scopeKey, ownerId: scopedOwnerId, kind: scopedOwnerId ? "account" : "guest" };
}

export function recordScopeKey(record) {
  if (isGuestScope(record?.scopeKey) || isAccountScope(record?.scopeKey)) return record.scopeKey;
  return record?.ownerId ? accountScopeKey(record.ownerId) : null;
}

export function isRecordVisible(record, scope) {
  const requestedScope = typeof scope === "string" && (isGuestScope(scope) || isAccountScope(scope))
    ? scope
    : typeof scope === "string" && scope ? accountScopeKey(scope) : null;
  return Boolean(requestedScope && recordScopeKey(record) === requestedScope);
}
