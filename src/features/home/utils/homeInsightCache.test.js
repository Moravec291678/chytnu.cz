import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { loadHomeInsightState, saveHomeInsightState, clearHomeInsightState, homeInsightCacheKey } from "./homeInsightCache.js";
import { openLocalDatabase, APP_META_STORE_NAME } from "../../catches/data/catchRepository.js";
import { quickCaptureGenerationKey } from "../../catches/data/quickCaptureLifecycle.js";

const state = { seenIds: ["a"], selection: { fingerprint: "fingerprint", id: "a", day: "2026-11-08" } };
const put = async (value) => {
  const db = await openLocalDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(APP_META_STORE_NAME, "readwrite");
    tx.objectStore(APP_META_STORE_NAME).put(value);
    tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
  });
  db.close();
};
const get = async (key) => {
  const db = await openLocalDatabase();
  const value = await new Promise((resolve, reject) => {
    const request = db.transaction(APP_META_STORE_NAME, "readonly").objectStore(APP_META_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
};

test("owner-scoped local insight selection survives database close/reopen without crossing accounts", async () => {
  const scope = { scopeKey: "account:home-A", ownerId: "home-A" };
  const loaded = await loadHomeInsightState(scope);
  assert.equal(await saveHomeInsightState(scope, state, loaded), true);
  const restored = await loadHomeInsightState(scope);
  assert.deepEqual(restored.seenIds, ["a"]);
  assert.deepEqual(restored.selection, state.selection);
  assert.equal((await loadHomeInsightState({ scopeKey: "account:home-B", ownerId: "home-B" })).selection, undefined);
});

test("legacy cached AI output and consent are removed while the local insight selection is kept", async () => {
  const scope = { scopeKey: "account:home-legacy", ownerId: "home-legacy" };
  await put({ key: homeInsightCacheKey(scope.scopeKey), kind: "homePersonalInsight", ...scope, ...state,
    consent: { version: 1, capabilities: { recommendations: true } }, result: { text: "legacy AI output" },
    blocked: { fingerprint: "old" }, cacheGeneration: "old-generation" });
  const restored = await loadHomeInsightState(scope);
  assert.deepEqual(restored.selection, state.selection);
  assert.deepEqual(restored.seenIds, state.seenIds);
  const stored = await get(homeInsightCacheKey(scope.scopeKey));
  for (const key of ["consent", "result", "blocked"]) assert.equal(Object.hasOwn(stored, key), false);
});

test("cache invalidation fences stale writes and catch deletion generation prevents resurrection", async () => {
  const scope = { scopeKey: "account:home-race", ownerId: "home-race" };
  const before = await loadHomeInsightState(scope);
  await clearHomeInsightState(scope);
  assert.equal(await saveHomeInsightState(scope, state, before), false);
  const fresh = await loadHomeInsightState(scope);
  assert.equal(await saveHomeInsightState(scope, state, fresh), true);
  await put({ key: quickCaptureGenerationKey(scope.scopeKey), generation: "deleted" });
  assert.equal(await saveHomeInsightState(scope, state, fresh), false);
});
