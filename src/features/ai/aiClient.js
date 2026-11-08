import { firebaseAuth } from "../auth/data/firebaseAuth.js";
import { resolveApiUrl } from "../../platform/api.js";
import { AI_FEATURES, AI_CONSENT_VERSION, hasAiConsent } from "./aiPolicy.js";
import { validateSpeciesSuggestion } from "./speciesSuggestion.js";
import { createStoryDraft } from "./storyDraft.js";

export const AI_PROVIDER = "cloudflare";
export const AI_CONSENT_CHANGED_EVENT = "chytnu:ai-consent-changed";
const CAPABILITIES = ["species", "stories", "diary", "recommendations"];
const MESSAGES = {
  consent_required: "Nejdřív povol tuto AI funkci v nastavení. Úlovek je uložený i bez AI.",
  disabled: "Tato AI funkce teď není zapnutá.", unauthenticated: "Pro AI se přihlas ke svému účtu.",
  account_changed: "Přihlášený účet se změnil. Otevři tuto stránku znovu.",
  quota_exceeded: "Bezplatný limit AI je pro dnešek vyčerpaný. Zkus to později.",
  rate_limited: "AI požadavek byl omezen. Úlovek je uložený; podrobnosti o limitu teď nejsou dostupné.",
  user_daily_limit: "Pro dnešek jsi využil dostupné AI požadavky. Další budou dostupné po obnovení limitu.",
  app_daily_limit: "Dnešní bezplatná kapacita AI je vyčerpaná. Místní funkce aplikace dál fungují.",
  text_daily_limit: "Dnešní kapacita textových AI nástrojů je využitá. Zbývající kapacitu chráníme pro fotografie úlovků.",
  provider_quota: "Bezplatný denní limit Cloudflare je vyčerpaný. Úlovky se dál ukládají; rozpoznání počká na obnovení kapacity.",
  request_in_progress: "Tento návrh se už připravuje. Výsledek načteme, až bude hotový.",
  provider_capacity: "AI je momentálně vytížená. Zkus to za chvíli.",
  provider_throttled: "Poskytovatel AI požadavek omezil. Přesný typ omezení teď není dostupný. Úlovek zůstává uložený.",
  provider_timeout: "AI neodpověděla včas. Tvůj deník a úlovky zůstávají uložené.",
  provider_auth: "Spojení s poskytovatelem AI vyžaduje opravu nastavení. Úlovky se dál ukládají.",
  provider_configuration: "Tato AI služba není správně nastavená. Místní funkce zůstávají dostupné.",
  network_unavailable: "S AI se nepodařilo spojit. Tvůj deník a úlovky zůstávají uložené.",
  quota_unavailable: "Dostupnou kapacitu AI se nepodařilo bezpečně ověřit. Zkus to později.",
  photo_not_ready: "Nejdřív nech fotografii nahrát po připojení. Úlovek už je uložený.",
  unavailable: "AI teď není dostupná. Zkus to později; tvé záznamy zůstávají uložené.",
  invalid_response: "AI nevrátila použitelný návrh. Zkus to později.",
  stale_draft: "Poznámka se mezitím změnila. Nech vytvořit nový návrh, aby se tvoje změny nepřepsaly.",
  stale_catch: "Úlovek se mezitím změnil. Spusť analýzu znovu nad aktuálním záznamem.",
  consent_conflict: "Volby AI se mezitím změnily na jiném zařízení. Načti je znovu a zopakuj svou volbu.",
  notes_required: "AI potřebuje neprázdnou synchronizovanou poznámku přiměřené délky. Zkrať text nebo počkej na synchronizaci.",
  insufficient_data: "V synchronizovaném deníku zatím není dost podkladů. Místní přehled můžeš použít i bez AI.",
};
export class AiClientError extends Error {
  constructor(code, { retryAt = null } = {}) {
    super(MESSAGES[code] ?? MESSAGES.unavailable); this.name = "AiClientError"; this.code = code;
    this.retryAt = typeof retryAt === "string" && Number.isFinite(Date.parse(retryAt)) ? retryAt : null;
    this.retryable = !["user_daily_limit", "app_daily_limit", "text_daily_limit", "provider_quota", "provider_throttled", "provider_auth", "provider_configuration", "consent_required", "disabled"].includes(code);
  }
}
const identifier = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const consentResult = (value) => value?.consent ? { ...value.consent, ...(value.cleanupPending === true ? { cleanupPending: true } : {}) } : null;

function taskPayload(capability, input) {
  if (capability === "species") {
    if (!identifier(input?.catchId) || !identifier(input?.photoId)) throw new AiClientError("unavailable");
    return { action: "species", catchId: input.catchId, photoId: input.photoId };
  }
  if (capability === "stories") {
    if (!identifier(input?.catchId) || !["summarize", "improve", "clarity", "title"].includes(input.task)) throw new AiClientError("unavailable");
    return { action: "story", catchId: input.catchId, task: input.task };
  }
  return { action: capability };
}

export function validateAiStoryDraft(value) {
  const originalNotes = value?.originalNotes ?? value?.sourceNotes;
  const action = value?.action ?? value?.task;
  if (value?.status !== "draft" || !identifier(value.catchId)) throw new AiClientError("invalid_response");
  try { return { ...createStoryDraft(originalNotes, value.text, action), catchId: value.catchId }; }
  catch { throw new AiClientError("invalid_response"); }
}

export function canApproveAiStory(record, draft) {
  return Boolean(record && !record.deleted && draft?.status === "draft" && draft.catchId === record.id
    && ["improve", "summarize"].includes(draft.action) && record.notes === draft.originalNotes
    && (draft.ownerId === undefined || record.ownerId === draft.ownerId)
    && (draft.expectedRevision === undefined || record.sync?.revision === draft.expectedRevision));
}

export function canDisplayAiResult(result, { ownerId, consent, capability }) {
  return Boolean(result && ownerId && result.ownerId === ownerId && Number.isSafeInteger(result.consentRevision)
    && result.consentRevision > 0 && result.consentRevision === consent?.revision && hasAiConsent(consent, capability, AI_PROVIDER));
}

/** Existing authenticated backend only. Personal payloads are obtained server-side after independent consent checks. */
export function createAiClient({ ownerId = null, getOwnerId = firebaseAuth.currentUserId,
  getToken = firebaseAuth.currentIdToken, fetchImpl = globalThis.fetch, flags = AI_FEATURES,
  endpoint = () => resolveApiUrl("/api/ai/species"), provider = AI_PROVIDER, timeoutMs = 30_000 } = {}) {
  async function request(body, { signal } = {}) {
    const currentOwner = ownerId ?? getOwnerId();
    if (!currentOwner || getOwnerId() !== currentOwner) throw new AiClientError("unauthenticated");
    let token;
    try { token = await getToken(); } catch { throw new AiClientError("unavailable"); }
    if (!token) throw new AiClientError("unauthenticated");
    if (getOwnerId() !== currentOwner) throw new AiClientError("account_changed");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetchImpl(endpoint(), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal, cache: "no-store" });
      if (getOwnerId() !== currentOwner) throw new AiClientError("account_changed");
      const value = await response.json();
      if (getOwnerId() !== currentOwner) throw new AiClientError("account_changed");
      if (controller.signal.aborted) throw new AiClientError("unavailable");
      if (!response.ok) {
        const rawCode = value?.error?.code ?? value?.error;
        const aliases = { ai_disabled: "disabled", quota_blocked: "quota_exceeded", authentication_required: "unauthenticated", account_unavailable: "account_changed",
          invalid_ai_response: "invalid_response", source_changed: "stale_catch", unsupported_photo: "photo_not_ready", photo_not_found: "photo_not_ready", photo_unavailable: "photo_not_ready",
          unsupported_notes: "notes_required", insufficient_data: "insufficient_data" };
        const code = aliases[rawCode] ?? rawCode;
        throw new AiClientError(typeof code === "string" ? code : "unavailable", { retryAt: value.retryAt });
      }
      return value;
    } catch (error) {
      if (error instanceof AiClientError) throw error;
      throw new AiClientError("unavailable");
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
  }
  return {
    getConsent: (options) => request({ action: "consent.get" }, options).then(consentResult),
    updateConsent: (capabilities, { expectedRevision = 0, automaticSpecies, ...options } = {}) => request({ action: "consent.update", version: AI_CONSENT_VERSION, expectedRevision,
      ...(typeof automaticSpecies === "boolean" ? { automaticSpecies } : {}),
      capabilities: Object.fromEntries(CAPABILITIES.map((key) => [key, capabilities?.[key] === true])) }, options).then(consentResult),
    revokeConsent: (options) => request({ action: "consent.revoke" }, options).then(consentResult),
    async runHome({ fingerprint }, { consent, signal } = {}) {
      if (!flags.recommendations) throw new AiClientError("disabled");
      if (!hasAiConsent(consent, "recommendations", provider)) throw new AiClientError("consent_required");
      if (!/^[a-f0-9]{32}$/.test(fingerprint ?? "")) throw new AiClientError("stale_catch");
      const result = await request({ action: "home", fingerprint }, { signal });
      if (result.status !== "generated" || result.fingerprint !== fingerprint || result.modelVersion !== "personal-fishing-v1"
        || result.consentRevision !== consent.revision || typeof result.text !== "string" || !result.text.trim() || result.text.length > 3000
        || !Number.isFinite(Date.parse(result.generatedAt)) || !Array.isArray(result.evidenceIds)
        || !result.evidenceIds.length || result.evidenceIds.length > 500 || result.evidenceIds.some(id => !identifier(id))) throw new AiClientError("invalid_response");
      return result;
    },
    async automaticSpecies({ catchId, photoId, statusOnly = false }, { consent, signal } = {}) {
      if (!flags.species) throw new AiClientError("disabled");
      if (!hasAiConsent(consent, "species", provider) || (!statusOnly && !consent.automaticSpecies)) throw new AiClientError("consent_required");
      if (!identifier(catchId) || !identifier(photoId)) throw new AiClientError("invalid_response");
      const result = await request({ action: statusOnly ? "species.status" : "species.auto", catchId, photoId }, { signal });
      if (["pending", "confirmed", "ineligible"].includes(result.status)) return result;
      const { sourceSha256, ...payload } = result;
      if (!/^[a-f0-9]{64}$/.test(sourceSha256 ?? "")) throw new AiClientError("invalid_response");
      try { return { ...validateSpeciesSuggestion(payload), sourceSha256 }; }
      catch { throw new AiClientError("invalid_response"); }
    },
    async run(capability, input, { consent, signal } = {}) {
      if (!CAPABILITIES.includes(capability) || flags[capability] !== true) throw new AiClientError("disabled");
      if (!hasAiConsent(consent, capability, provider)) throw new AiClientError("consent_required");
      const result = await request(taskPayload(capability, input), { signal });
      if (capability === "species") {
        try {
          const sourceSha256 = result.sourceSha256;
          if (typeof sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(sourceSha256)) throw new TypeError("Missing photo identity.");
          const { sourceSha256: ignoredSourceHash, ...payload } = result;
          void ignoredSourceHash;
          return { ...validateSpeciesSuggestion(result.suggestion ?? payload), sourceSha256 };
        }
        catch { throw new AiClientError("invalid_response"); }
      }
      if (capability === "stories") return validateAiStoryDraft(result.draft ?? result);
      const value = result.explanation ?? result;
      if (typeof value?.text !== "string" || !value.text.trim() || value.text.length > 16_000) throw new AiClientError("invalid_response");
      const summary = value.summary;
      if (!summary || !Number.isInteger(summary.count) || summary.count < 0 || summary.count > 500
        || !Array.isArray(value.evidenceIds) || value.evidenceIds.length > 500 || value.evidenceIds.some((id) => !identifier(id))
        || new Set(value.evidenceIds).size !== summary.count) throw new AiClientError("invalid_response");
      return { status: "generated", text: value.text.trim(), isHypothesis: true, summary: { count: summary.count },
        evidenceIds: [...new Set(value.evidenceIds)], truncated: value.truncated === true,
        limitations: Array.isArray(value.limitations) ? value.limitations.filter((line) => typeof line === "string" && line.length <= 1000).slice(0, 10) : [] };
    },
  };
}
