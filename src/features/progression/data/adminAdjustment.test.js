import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { loadAdminAdjustment, cachedAdminAdjustment } from "./adminAdjustment.js";
import { applyProgressionAdjustment, summaryForXp } from "./progressionSummary.js";
import { openLocalDatabase, APP_META_STORE_NAME } from "../../catches/data/catchRepository.js";
import { quickCaptureGenerationKey } from "../../catches/data/quickCaptureLifecycle.js";

test("late XP response cannot recreate a cache after account cleanup changes its generation", async () => {
  const scope = { ownerId: "deleted-adjustment", scopeKey: "account:deleted-adjustment" };
  await loadAdminAdjustment(scope, { request: async () => {
    const db = await openLocalDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(APP_META_STORE_NAME, "readwrite");
      tx.objectStore(APP_META_STORE_NAME).put({ key: quickCaptureGenerationKey(scope.scopeKey), generation: "cleanup-new-generation" });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close(); return { adjustmentXp: 200, revision: 1 };
  } });
  assert.equal((await cachedAdminAdjustment(scope)).adjustmentXp, 0);
});
test("server corrections change real XP/level calculations without mutating original rewards",()=>{
  const original={...summaryForXp(40),xpBreakdown:{catchXp:40},events:[{xp:40}]};
  const corrected=applyProgressionAdjustment(original,100);assert.equal(corrected.xp,140);assert.ok(corrected.level>original.level);assert.equal(original.xp,40);assert.deepEqual(original.events,[{xp:40}]);assert.equal(corrected.xpBreakdown.adminAdjustmentXp,100);assert.equal(applyProgressionAdjustment(original,-100).xp,0);
});
test("last server correction survives offline reopen, is owner scoped, and invalid responses cannot change it",async()=>{
  const scope={ownerId:"adjustment-owner",scopeKey:"account:adjustment-owner"};
  const result=await loadAdminAdjustment(scope,{request:async()=>({adjustmentXp:75,revision:1})});assert.equal(result.adjustmentXp,75);
  assert.equal((await cachedAdminAdjustment(scope)).adjustmentXp,75);
  assert.equal((await loadAdminAdjustment(scope,{request:async()=>{throw new Error("offline");}})).adjustmentXp,75);
  assert.equal((await cachedAdminAdjustment({ownerId:"other",scopeKey:"account:other"})).adjustmentXp,0);
  assert.equal((await loadAdminAdjustment(scope,{request:async()=>({adjustmentXp:Infinity,revision:2})})).adjustmentXp,75);
});
