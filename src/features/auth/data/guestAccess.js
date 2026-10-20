const GUEST_ACCESS_KEY = "chytnu:guest-access:v1";

export function isGuestAccessConfirmed(storage = globalThis.localStorage) {
  try { return storage?.getItem(GUEST_ACCESS_KEY) === "confirmed"; } catch { return false; }
}

export function confirmGuestAccess(storage = globalThis.localStorage) {
  try { storage?.setItem(GUEST_ACCESS_KEY, "confirmed"); } catch { /* local profile remains usable */ }
}

export function clearGuestAccess(storage = globalThis.localStorage) {
  try { storage?.removeItem(GUEST_ACCESS_KEY); } catch { /* best effort */ }
}
