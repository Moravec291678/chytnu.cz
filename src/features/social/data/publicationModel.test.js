import { test } from "node:test";
import assert from "node:assert/strict";
import { publicationInput,publicationContent,publicationId,contentFingerprint } from "./publicationModel.js";
const input=()=>publicationInput({catchId:"catch",visibility:"public",description:"Schválený text",fields:{length:true,weight:true,date:"month",method:true,water:true}});
test("publication uses immutable canonical identity and rejects client owner/URLs/GPS",()=>{
  assert.equal(publicationId("a","catch"),publicationId("a","catch")); assert.notEqual(publicationId("b","catch"),publicationId("a","catch"));
  for (const extra of [{ownerUid:"b"},{content:{species:"Fake"}},{url:"https://example.test/a.jpg"},{coordinates:{latitude:50}}]) assert.throws(()=>publicationInput({...input(),...extra}));
  for (const fields of [{length:"yes"},{date:"time"},{gps:true},[]]) assert.throws(()=>publicationInput({...input(),fields}));
});
test("explicit approved projection excludes private location, exact time, notes and estimated weight",()=>{
  const source={species:"Kapr",lengthCm:53,weightKg:2.5,weightSource:"estimated",caughtAt:"2026-11-11T12:15:00Z",method:{label:"Feeder"},locationName:"SECRET",notes:"PRIVATE",coordinates:{latitude:50}};
  const publicRow=publicationContent(source,input(),{id:`ris-${"a".repeat(24)}`,name:"Veřejný revír"});
  assert.deepEqual(publicRow,{species:"Kapr",description:"Schválený text",lengthCm:53,caughtAt:"2026-11",method:"Feeder",catalogueId:`ris-${"a".repeat(24)}`,waterName:"Veřejný revír"});
  assert.equal(publicationContent({...source,weightSource:"manual"},input()).weightKg,2.5);
  assert.equal(contentFingerprint(publicRow),contentFingerprint(publicRow));
  assert.notEqual(contentFingerprint({...publicRow,lengthCm:54}),contentFingerprint(publicRow));
  assert.deepEqual(publicationContent(source,publicationInput({catchId:"catch",visibility:"private",description:""})),{species:"Kapr",description:""});
});
