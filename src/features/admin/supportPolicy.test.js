import test from "node:test";
import assert from "node:assert/strict";
import { activeSupportGrant, safeSupportCatch, safeSupportTrip } from "./supportPolicy.js";
import { validateAdminRequest } from "./server/adminValidation.js";
import { validateSupportSnapshot } from "./server/supportValidation.js";
import { supportProgressionSnapshot } from "./supportSnapshot.js";
import { resolveAccess } from "./adminPolicy.js";

test("support grants are bound to account, staff, case, categories, expiration and revocation", () => {
  const grant = { ownerId: "u", granteeUid: "a", caseId: "c", categories: ["photos"], createdAt: "2026-11-01T00:00:00Z", expiresAt: "2026-11-01T01:00:00Z", revokedAt: null };
  const request = { uid: "u", actorUid: "a", caseId: "c", category: "photos", now: Date.parse("2026-11-01T00:30:00Z") };
  assert.equal(activeSupportGrant(grant, request), true);
  for (const change of [{ uid: "other" }, { actorUid: "other" }, { caseId: "other" }, { category: "catches" }, { now: Date.parse(grant.expiresAt) }, { now: 0 }]) assert.equal(activeSupportGrant(grant, { ...request, ...change }), false);
  assert.equal(activeSupportGrant({ ...grant, revokedAt: "2026-11-01T00:10:00Z" }, request), false);
});
test("support projections exclude exact location, private notes, embedded image URLs and unrelated fields", () => {
  const original = { id: "c", ownerId: "u", species: "Kapr", captureMode: "quick", speciesKey: "", lengthCm: 0, weightKg: 2, weightSource: "estimated", method: {key:"feeder",label:"Feeder", coordinates:{latitude:50}}, baits:[{key:"corn",label:"Kukuřice",url:"secret"}], coordinates:{latitude:50}, waterName:"SECRET", notes:"SECRET", photos:[{publicUrl:"SECRET"}], privacy:{visibility:"private"} };
  const view = safeSupportCatch(original);
  assert.doesNotMatch(JSON.stringify(view), /SECRET|latitude|ownerId|url/); assert.equal(view.lengthCm,null); assert.equal(view.weightSource,"estimated"); assert.equal(view.captureMode,"quick");
  assert.equal(safeSupportCatch({...original,deleted:true}),null);
  assert.deepEqual(safeSupportTrip({id:"t",coordinates:{latitude:50},waterName:"SECRET",status:"completed"}),{id:"t",startedAt:null,endedAt:null,status:"completed"});
});
test("strict support requests reject hidden bypasses, unbounded selections and invalid correction values", () => {
  for (const request of [
    {action:"support.open",category:"XP",description:"Example",uid:"other"},
    {action:"support.grant",caseId:"c",categories:["gps"],hours:1,photoRefs:[]},
    {action:"support.grant",caseId:"c",categories:["photos"],hours:73,photoRefs:[]},
    {action:"support.grant",caseId:"c",categories:["photos"],hours:1,photoRefs:[{catchId:"c",photoId:"p",url:"https://attacker.test"}]},
    {action:"progression.adjust",uid:"u",caseId:"c",grantId:"g",delta:10001,reason:"reason",operationId:"id",expectedRevision:0,expectedBaseXp:0},
    {action:"progression.preview",uid:"u",caseId:"c",grantId:"g",delta:0.5},
    {action:"support.photo",uid:"u",catchId:"../x",photoId:"p"},
  ]) assert.throws(()=>validateAdminRequest(request));
  assert.equal(validateAdminRequest({action:"support.photo",uid:"u",catchId:"c",photoId:"p"}).action,"support.photo");
});
test("shared diagnostic snapshots never carry precise location or invent achievement dates", () => {
  const snapshot = supportProgressionSnapshot({ xp:150,adminAdjustmentXp:50,achievements:[{id:"first",name:"První",isCompleted:true,xp:20,coordinates:{latitude:50}}],mastery:[],streak:{weeks:2}},[{id:"e",type:"challenge.completed",reasonKey:"challenge:first",xp:50}]);
  assert.equal(snapshot.baseXp,100); assert.equal(snapshot.achievements[0].occurredAt,undefined); assert.doesNotMatch(JSON.stringify(snapshot),/latitude/);
  assert.deepEqual(validateSupportSnapshot(snapshot),snapshot);
  assert.throws(()=>validateSupportSnapshot({baseXp:1,credentials:"secret"}));
});
test("temporary support privileges expire without removing principal identity or giving security powers", () => {
  const now=Date.parse("2026-11-01T10:00:00Z");
  const active=resolveAccess("co",{permissions:["support","users.read"],permissionsExpiresAt:"2026-11-01T11:00:00Z"},"owner",now,"co");
  assert.ok(active.permissions.includes("support")); assert.equal(active.internalLimitExempt,true); assert.equal(active.permissions.includes("users.manage"),false);
  const expired=resolveAccess("co",{permissions:["support","users.read"],permissionsExpiresAt:"2026-11-01T09:00:00Z"},"owner",now,"co");
  assert.deepEqual(expired.permissions,["tasks","monitoring"]);
});
