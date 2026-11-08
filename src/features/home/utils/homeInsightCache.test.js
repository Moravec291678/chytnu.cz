import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { loadHomeInsightState, saveHomeInsightState, clearHomeInsightState, usableHomeAiResult } from "./homeInsightCache.js";
import { HOME_ANALYSIS_VERSION } from "../../ai/personalFishingAnalysis.js";
import { openLocalDatabase, APP_META_STORE_NAME } from "../../catches/data/catchRepository.js";
import { quickCaptureGenerationKey } from "../../catches/data/quickCaptureLifecycle.js";
const now = Date.parse("2026-11-08T12:00:00Z");
const consent = { version: 1, provider: "cloudflare", revision: 2, grantedAt: "2026-11-08T10:00:00Z", capabilities: { recommendations: true } };
const data = ownerId => ({ ownerId, consent, result: { ownerId, status: "generated", text: "Ověř popsaný rozdíl stejnou metodou.", fingerprint: "fingerprint", modelVersion: HOME_ANALYSIS_VERSION,
  consentRevision: 2, evidenceIds: ["catch1"], generatedAt: new Date(now).toISOString() }, seenIds: ["a"], selection: { fingerprint: "fingerprint", id: "a", day: "2026-11-08" } });
const check = ownerId => ({ ownerId, fingerprint: "fingerprint", now, evidenceIds: ["catch1"] });
test("owner-scoped AI result and selection survive database close/reopen without crossing accounts", async () => {
  const scope = { scopeKey: "account:home-A", ownerId: "home-A" };
  const state = await loadHomeInsightState(scope);
  assert.equal(await saveHomeInsightState(scope, data(scope.ownerId), state), true);
  const restored = await loadHomeInsightState(scope);
  assert.equal(usableHomeAiResult(restored, check(scope.ownerId)), true);
  assert.deepEqual(restored.seenIds, ["a"]);
  assert.equal((await loadHomeInsightState({ scopeKey: "account:home-B", ownerId: "home-B" })).result, undefined);
  assert.equal(usableHomeAiResult(restored, check("home-B")), false);
});
test("stale fingerprints, revoked/regranted consent, changed evidence, expired result and model version invalidate reuse", () => {
  const state = data("owner");
  assert.equal(usableHomeAiResult(state, check("owner")), true);
  for (const changed of [
    { ...state, result: { ...state.result, fingerprint: "old" } },
    { ...state, consent: { ...consent, revision: 3 } },
    { ...state, consent: { ...consent, revokedAt: new Date(now).toISOString() } },
    { ...state, result: { ...state.result, generatedAt: "2026-10-01T00:00:00Z" } },
    { ...state, result: { ...state.result, modelVersion: "old" } },
    { ...state, result: { ...state.result, evidenceIds: ["not-owned"] } },
  ]) assert.equal(usableHomeAiResult(changed, check("owner")), false);
});
test("revocation fences an in-flight cached result and local deletion generation prevents resurrection", async () => {
  const scope = { scopeKey: "account:home-race", ownerId: "home-race" };
  const before = await loadHomeInsightState(scope);
  await clearHomeInsightState(scope);
  assert.equal(await saveHomeInsightState(scope, data(scope.ownerId), before), false);
  const fresh = await loadHomeInsightState(scope);
  assert.equal(await saveHomeInsightState(scope, data(scope.ownerId), fresh), true);
  const db = await openLocalDatabase();
  await new Promise(resolve => {
    const tx = db.transaction(APP_META_STORE_NAME, "readwrite");
    tx.objectStore(APP_META_STORE_NAME).put({ key: quickCaptureGenerationKey(scope.scopeKey), generation: "deleted" }); tx.oncomplete = resolve;
  }); db.close();
  assert.equal(await saveHomeInsightState(scope, data(scope.ownerId), fresh), false);
});
