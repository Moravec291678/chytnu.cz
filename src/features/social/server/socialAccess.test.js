import { test } from "node:test";
import assert from "node:assert/strict";
import { activeSocialPhoto } from "./socialAccess.js";
test("production path-owned photo metadata needs an active owned parent reference, not an owner field",()=>{
  const parent={ownerId:"a",deleted:false,photoRefs:{photo:true}},photo={id:"photo",deleted:false};
  assert.equal(activeSocialPhoto(parent,photo,"a","photo"),true);
  assert.equal(activeSocialPhoto(parent,{...photo,ownerId:"a"},"a","photo"),true);
  for (const candidate of [undefined,{...photo,ownerId:"b"},{...photo,id:"other"},{...photo,deleted:true}]) assert.equal(activeSocialPhoto(parent,candidate,"a","photo"),false);
  for (const candidate of [undefined,{...parent,ownerId:"b"},{...parent,deleted:true},{...parent,photoRefs:{}},{ownerId:"a"}]) assert.equal(activeSocialPhoto(candidate,photo,"a","photo"),false);
  assert.equal(activeSocialPhoto({...parent,photoIds:["photo"],photoRefs:{}},photo,"a","photo"),false,"current reference map overrides legacy arrays");
  assert.equal(activeSocialPhoto({ownerId:"a",photos:[{id:"photo"}]},photo,"a","photo"),true);
});
