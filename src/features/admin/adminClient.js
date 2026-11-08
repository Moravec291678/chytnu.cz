import { firebaseAuth } from "../auth/data/firebaseAuth.js";
import { resolveApiUrl } from "../../platform/api.js";
export { hasAdminPermission } from "./adminPolicy.js";

const messages = {
  authentication_required: "Přihlas se ke svému účtu.", forbidden: "Pro tuto operaci nemáš oprávnění.",
  admin_required: "Administrace je dostupná pouze pověřeným správcům.", owner_required: "Tuto změnu může provést pouze vlastník.",
  account_suspended: "Účet je pozastavený.", recent_auth_required: "Pro citlivou změnu se z bezpečnostních důvodů znovu přihlas.",
  invalid_request: "Zkontroluj zadané hodnoty.", invalid_input: "Zkontroluj zadané hodnoty.",
  conflict: "Záznam se mezitím změnil. Načti aktuální údaje a úpravu zopakuj.",
  user_not_found: "Účet se nepodařilo najít. Hledej podle přesného UID nebo e-mailu.",
  not_found: "Záznam již není dostupný.", owner_protected: "Oprávnění vlastníka nelze odebrat ani pozastavit.",
  account_changed: "Aktivní účet se změnil. Načti administraci znovu.", offline: "Administrace vyžaduje připojení. Místní rybářský deník funguje dál.",
};
export class AdminClientError extends Error {
  constructor(code = "unavailable") { super(messages[code] || "Administrace teď není dostupná. Zkus to později."); this.code = code; }
}
export function createAdminClient({ ownerId, getOwnerId = firebaseAuth.currentUserId, getToken = firebaseAuth.currentIdToken,
  fetchImpl = globalThis.fetch, endpoint = () => resolveApiUrl("/api/admin"), timeoutMs = 15_000 } = {}) {
  return { ownerId, async request(action, payload = {}, { signal } = {}) {
    if (!ownerId || getOwnerId() !== ownerId) throw new AdminClientError("authentication_required");
    if (globalThis.navigator?.onLine === false) throw new AdminClientError("offline");
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const token = await getToken();
      if (!token || getOwnerId() !== ownerId) throw new AdminClientError("account_changed");
      const response = await fetchImpl(endpoint(), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action }), cache: "no-store", signal: controller.signal });
      if (getOwnerId() !== ownerId) throw new AdminClientError("account_changed");
      const value = await response.json();
      if (getOwnerId() !== ownerId || controller.signal.aborted) throw new AdminClientError("account_changed");
      if (!response.ok) {
        if (action !== "self" && [401, 403].includes(response.status)) globalThis.window?.dispatchEvent(new Event("chytnu:admin-access-changed"));
        throw new AdminClientError(typeof value?.error === "string" ? value.error : "unavailable");
      }
      if (action === "self" && value?.access?.uid !== ownerId) throw new AdminClientError("account_changed");
      return value;
    } catch (error) { if (error instanceof AdminClientError) throw error; throw new AdminClientError(); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  } };
}

export const canOpenAdmin = access => Boolean(access && !access.suspended && (access.role === "OWNER" || ["ADMIN", "CO_CREATOR"].includes(access.role) && access.permissions?.length > 0));
