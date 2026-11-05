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
  rate_limited: "AI teď zpracovává příliš mnoho požadavků. Zkus to později.",
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
  constructor(code) { super(MESSAGES[code] ?? MESSAGES.unavailable); this.name = "AiClientError"; this.code = code; }
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
        const aliases = { ai_disabled: "disabled", quota_blocked: "quota_exceeded", authentication_required: "unauthenticated",
          invalid_ai_response: "invalid_response", source_changed: "stale_catch", unsupported_photo: "photo_not_ready", photo_not_found: "photo_not_ready",
          unsupported_notes: "notes_required", insufficient_data: "insufficient_data" };
        const code = aliases[rawCode] ?? rawCode;
        throw new AiClientError(typeof code === "string" ? code : "unavailable");
      }
      return value;
    } catch (error) {
      if (error instanceof AiClientError) throw error;
      throw new AiClientError("unavailable");
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
  }
  return {
    getConsent: (options) => request({ action: "consent.get" }, options).then(consentResult),
    updateConsent: (capabilities, { expectedRevision = 0, ...options } = {}) => request({ action: "consent.update", version: AI_CONSENT_VERSION, expectedRevision,
      capabilities: Object.fromEntries(CAPABILITIES.map((key) => [key, capabilities?.[key] === true])) }, options).then(consentResult),
    revokeConsent: (options) => request({ action: "consent.revoke" }, options).then(consentResult),
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
