import { APP_META_STORE_NAME, openLocalDatabase } from "../../catches/data/catchRepository.js";
import { quickCaptureGenerationKey } from "../../catches/data/quickCaptureLifecycle.js";
import { validateDataScope } from "../../auth/data/localDataScope.js";

export const homeInsightCacheKey = scopeKey => JSON.stringify(["homePersonalInsight", scopeKey]);
const requestValue = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const validSeenIds = value => Array.isArray(value) ? value.filter(id => typeof id === "string" && id.length <= 100).slice(-40) : [];
const hasLegacyAiData = value => value && ["consent", "result", "blocked"].some(key => Object.hasOwn(value, key));

export async function loadHomeInsightState(options) {
  const scope = validateDataScope(options);
  const db = await openLocalDatabase();
  let stored, capture;
  try {
    const tx = db.transaction(APP_META_STORE_NAME, "readonly"), store = tx.objectStore(APP_META_STORE_NAME);
    [stored, capture] = await Promise.all([requestValue(store.get(homeInsightCacheKey(scope.scopeKey))), requestValue(store.get(quickCaptureGenerationKey(scope.scopeKey)))]);
  } finally { db.close(); }
  if (stored?.scopeKey === scope.scopeKey && stored.ownerId === scope.ownerId && hasLegacyAiData(stored)) {
    const cacheGeneration = await clearHomeInsightState(scope);
    return { ownerId: scope.ownerId, scopeKey: scope.scopeKey, captureGeneration: capture?.generation ?? null,
      cacheGeneration, selection: stored.selection ?? null, seenIds: validSeenIds(stored.seenIds) };
  }
  return { ...(stored?.scopeKey === scope.scopeKey && stored.ownerId === scope.ownerId ? {
    selection: stored.selection ?? null, seenIds: validSeenIds(stored.seenIds),
  } : {}), ownerId: scope.ownerId, scopeKey: scope.scopeKey, captureGeneration: capture?.generation ?? null,
  cacheGeneration: stored?.cacheGeneration ?? null };
}

export async function saveHomeInsightState(options, next, { captureGeneration = null, cacheGeneration = null } = {}) {
  const scope = validateDataScope(options);
  const permitted = { selection: next.selection ?? null, seenIds: validSeenIds(next.seenIds) };
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
          || (current?.cacheGeneration ?? null) !== cacheGeneration) return;
        store.put({ key: homeInsightCacheKey(scope.scopeKey), kind: "homePersonalInsight", ...scope, ...permitted, cacheGeneration }); saved = true;
      };
    };
    tx.oncomplete = () => { db.close(); resolve(saved); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Přehled se nepodařilo uložit.")); };
  });
}

export async function clearHomeInsightState(options) {
  const scope = validateDataScope(options);
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_META_STORE_NAME, "readwrite"), store = tx.objectStore(APP_META_STORE_NAME);
    const request = store.get(homeInsightCacheKey(scope.scopeKey));
    let cacheGeneration;
    request.onsuccess = () => {
      cacheGeneration = crypto.randomUUID();
      const current = request.result;
      store.put({ key: homeInsightCacheKey(scope.scopeKey), kind: "homePersonalInsight", ...scope,
        selection: current?.ownerId === scope.ownerId ? current.selection ?? null : null,
        seenIds: current?.ownerId === scope.ownerId ? validSeenIds(current.seenIds) : [],
        cacheGeneration });
    };
    tx.oncomplete = () => { db.close(); resolve(cacheGeneration); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
