import { APP_META_STORE_NAME, openLocalDatabase } from "../../catches/data/catchRepository.js";
import { quickCaptureGenerationKey } from "../../catches/data/quickCaptureLifecycle.js";
import { validateDataScope } from "../../auth/data/localDataScope.js";
import { hasAiConsent } from "../../ai/aiPolicy.js";
import { HOME_ANALYSIS_VERSION } from "../../ai/personalFishingAnalysis.js";

const MAX_AGE = 7 * 86_400_000;
export const homeInsightCacheKey = scopeKey => JSON.stringify(["homePersonalInsight", scopeKey]);
const requestValue = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function usableHomeAiResult(state, { ownerId, fingerprint, now = Date.now(), evidenceIds = [] }) {
  const result = state?.result, consent = state?.consent;
  const generated = Date.parse(result?.generatedAt);
  const allowed = new Set(evidenceIds);
  return Boolean(ownerId && state?.ownerId === ownerId && result?.ownerId === ownerId
    && result.fingerprint === fingerprint && result.modelVersion === HOME_ANALYSIS_VERSION
    && result.consentRevision === consent?.revision && hasAiConsent(consent, "recommendations", "cloudflare")
    && Number.isFinite(generated) && generated <= now + 300_000 && now - generated <= MAX_AGE
    && typeof result.text === "string" && result.text.trim() && result.text.length <= 8000
    && Array.isArray(result.evidenceIds) && result.evidenceIds.length <= 500 && result.evidenceIds.every(id => validId(id) && allowed.has(id)));
}

export async function loadHomeInsightState(options) {
  const scope = validateDataScope(options);
  const db = await openLocalDatabase();
  try {
    const tx = db.transaction(APP_META_STORE_NAME, "readonly"), store = tx.objectStore(APP_META_STORE_NAME);
    const [stored, capture] = await Promise.all([requestValue(store.get(homeInsightCacheKey(scope.scopeKey))), requestValue(store.get(quickCaptureGenerationKey(scope.scopeKey)))]);
    return { ...(stored?.scopeKey === scope.scopeKey && stored.ownerId === scope.ownerId ? stored : {}),
      ownerId: scope.ownerId, scopeKey: scope.scopeKey, captureGeneration: capture?.generation ?? null,
      cacheGeneration: stored?.cacheGeneration ?? null };
  } finally { db.close(); }
}

export async function saveHomeInsightState(options, next, { captureGeneration = null, cacheGeneration = null } = {}) {
  const scope = validateDataScope(options);
  const permitted = { consent: next.consent ?? null, result: next.result ?? null,
    selection: next.selection ?? null, seenIds: Array.isArray(next.seenIds) ? next.seenIds.filter(id => typeof id === "string" && id.length <= 100).slice(-40) : [],
    blocked: next.blocked ?? null };
  if (JSON.stringify(permitted).length > 24_000 || (permitted.result && permitted.result.ownerId !== scope.ownerId)) return false;
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_META_STORE_NAME, "readwrite"), store = tx.objectStore(APP_META_STORE_NAME);
    let saved = false;
    const currentRequest = store.get(homeInsightCacheKey(scope.scopeKey));
    currentRequest.onsuccess = () => {
      const current = currentRequest.result;
      const captureRequest = store.get(quickCaptureGenerationKey(scope.scopeKey));
      captureRequest.onsuccess = () => {
        if ((captureRequest.result?.generation ?? null) !== captureGeneration
          || (current?.cacheGeneration ?? null) !== cacheGeneration
          || (current?.consent?.revision ?? 0) > (permitted.consent?.revision ?? 0)) return;
        store.put({ key: homeInsightCacheKey(scope.scopeKey), kind: "homePersonalInsight", ...scope, ...permitted, cacheGeneration }); saved = true;
      };
    };
    tx.oncomplete = () => { db.close(); resolve(saved); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Přehled se nepodařilo uložit.")); };
  });
}

// A revocation epoch fences already-running model responses even if their
// network request could not be canceled. It never changes the Catch generation.
export async function clearHomeInsightState(options) {
  const scope = validateDataScope(options);
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_META_STORE_NAME, "readwrite");
    tx.objectStore(APP_META_STORE_NAME).put({ key: homeInsightCacheKey(scope.scopeKey), kind: "homePersonalInsight", ...scope,
      consent: null, result: null, cacheGeneration: crypto.randomUUID(), seenIds: [] });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
