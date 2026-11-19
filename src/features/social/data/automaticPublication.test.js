import { test } from "node:test";
import assert from "node:assert/strict";
import { publishNewSyncedCatches } from "./automaticPublication.js";
const settings={hasSavedSettings:true,defaultCatchVisibilityExplicit:true,defaultCatchVisibility:"public"};
test("automatic publication is scoped, opt-in, throttled and independent of sync errors",async()=>{
  let calls=0,time=100000;
  const options={request:async action=>{assert.equal(action,"posts.publishNew");calls++;},now:()=>time,
    readSettings:async scope=>{assert.equal(scope.ownerId,"auto-owner");return settings;},activeUid:()=>"auto-owner"};
  await publishNewSyncedCatches("auto-owner",options);await publishNewSyncedCatches("auto-owner",options);assert.equal(calls,1);
  time+=61000;await publishNewSyncedCatches("auto-owner",{...options,activeUid:()=>"other"});assert.equal(calls,1);
  time+=61000;await publishNewSyncedCatches("auto-owner",{...options,readSettings:async()=>({...settings,defaultCatchVisibility:"private"})});assert.equal(calls,1);
  time+=61000;await publishNewSyncedCatches("auto-owner",{...options,request:async()=>{throw Error("offline");}});
  time+=61000;await publishNewSyncedCatches("auto-owner",options);assert.equal(calls,1);
});
