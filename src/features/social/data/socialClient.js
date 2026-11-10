import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { resolveApiUrl } from "../../../platform/api.js";
const messages = {
  handle_taken: "Toto uživatelské jméno je již rezervované. Vyber jiné.", authentication_required: "Nejdřív se přihlas.",
  account_unavailable: "Účet nyní není dostupný.", invalid_profile: "Zkontroluj údaje profilu a délku textů.", invalid_request: "Zkontroluj údaje profilu.",
  invalid_shared_catch: "Vybraný úlovek už není dostupný. Obnov nabídku.", invalid_shared_photo: "Sdílet lze pouze dostupné synchronizované fotografie JPEG.",
  request_limit: "Byl dosažen bezpečnostní limit. Zkus to později.", social_rate_limit: "Příliš mnoho změn. Zkus to za minutu.",
  invalid_avatar: "Avatar musí být JPEG do 200 kB a 512 × 512 bodů.", avatar_unavailable: "Avatar nyní nelze uložit nebo načíst.",
  save_profile_first: "Nejdříve ulož svůj rybářský profil.", offline: "Veřejný profil vyžaduje připojení. Soukromý deník funguje dál i offline.",
};
export async function socialRequest(action, payload = {}, { signal } = {}) {
  if (globalThis.navigator?.onLine === false) throw new Error(messages.offline);
  const uid = firebaseAuth.currentUserId(), controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 25_000);
  try {
    const token = uid ? await firebaseAuth.currentIdToken() : null;
    if (firebaseAuth.currentUserId() !== uid) throw new Error("Aktivní účet se změnil. Načti profil znovu.");
    const response = await fetch(resolveApiUrl("/api/social"), { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...payload, action }), cache: "no-store", signal: controller.signal });
    const data = await response.json();
    if (firebaseAuth.currentUserId() !== uid || controller.signal.aborted) throw new Error("Aktivní účet se změnil. Načti profil znovu.");
    if (!response.ok) throw new Error(messages[data.error] ?? "Profil není dostupný. Zkus to později.");
    return data;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
