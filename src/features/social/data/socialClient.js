import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { resolveApiUrl } from "../../../platform/api.js";
const messages = {
  consent_conflict: "Soukromí se změnilo na jiném zařízení. Obnov stránku a zkontroluj aktuální nastavení.",
  publication_consent_required: "Nejdřív zvol a ulož veřejný režim v nastavení rybářského profilu.",
  invalid_consent: "Potvrzení sdílení není platné. Otevři znovu nastavení rybářského profilu.",
  invalid_publication: "Zkontroluj obsah příspěvku a vybrané údaje.", post_unavailable: "Příspěvek byl odstraněn nebo pro tebe není dostupný.",
  post_conflict: "Příspěvek se mezitím změnil na jiném zařízení. Zavři sdílení a načti ho znovu.",
  photo_unavailable: "Fotografii nyní nelze bezpečně sdílet. Zkontroluj synchronizaci a zkus to později.",
  photo_preparing: "Bezpečná kopie fotografie se připravuje nebo její opakování dočasně čeká. Zkus to později.",
  relationship_conflict: "Propojení se mezitím změnilo nebo je další pozvání dočasně omezené. Obnov stav.",
  invalid_search: "Zadej 2 až 40 znaků jména, zájmu nebo regionu.", invalid_cursor: "Výsledky se změnily nebo stránkování vypršelo. Vyhledej rybáře znovu.",
  profile_required: "Před odesláním pozvání ulož veřejný rybářský profil a povol dohledání podle jména.", discovery_unavailable: "Vyhledávání nyní není dostupné. Zkus to později.",
  handle_taken: "Toto uživatelské jméno je již rezervované. Vyber jiné.", authentication_required: "Nejdřív se přihlas.",
  account_unavailable: "Účet nyní není dostupný.", invalid_profile: "Zkontroluj údaje profilu a délku textů.", invalid_request: "Zkontroluj údaje profilu.",
  invalid_shared_catch: "Vybraný úlovek už není dostupný. Obnov nabídku.", invalid_shared_photo: "Sdílet lze pouze dostupné synchronizované fotografie JPEG.",
  request_limit: "Byl dosažen bezpečnostní limit. Zkus to později.", social_rate_limit: "Příliš mnoho změn. Zkus to za minutu.",
  invalid_avatar: "Avatar musí být JPEG do 200 kB a 512 × 512 bodů.", avatar_unavailable: "Avatar nyní nelze uložit nebo načíst.",
  save_profile_first: "Nejdříve ulož svůj rybářský profil.", offline: "Veřejný profil vyžaduje připojení. Soukromý deník funguje dál i offline.",
  invalid_interaction: "Údaje reakce nebo komentáře nejsou platné.", interaction_conflict: "Reakce se mezitím změnila. Načti příspěvek znovu.",
  comment_unavailable: "Komentář již není dostupný nebo ho nemůžeš upravit.", comment_conflict: "Komentář se mezitím změnil. Načti jej znovu.",
  comment_duplicate: "Tento komentář byl nedávno odeslán. Počkej před dalším pokusem.",
  consent_required: "Před zapnutím Okolí potvrď výslovný souhlas se sdílením pouze hrubé oblasti.",
  water_presence_conflict: "Přítomnost se změnila na jiném zařízení nebo vypršela. Načti aktuální stav.",
};
export async function socialRequest(action, payload = {}, { signal, expectedUid } = {}) {
  if (globalThis.navigator?.onLine === false) throw new Error(messages.offline);
  const uid = firebaseAuth.currentUserId(), controller = new AbortController();
  if (expectedUid !== undefined && uid !== expectedUid) throw new Error("Aktivní účet se změnil. Načti profil znovu.");
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
  } catch (error) {
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error("Načítání trvá příliš dlouho. Zkus to znovu.", { cause: error });
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error("Připojení k veřejným profilům není dostupné. Zkus to znovu.", { cause: error });
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
