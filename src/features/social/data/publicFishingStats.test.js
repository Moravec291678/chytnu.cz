import {test} from "node:test";
import assert from "node:assert/strict";
import {publicFishingStats} from "./publicFishingStats.js";
test("public statistics deduplicate legacy/new approvals and never restore unapproved measurements",()=>{
  const result=publicFishingStats([{id:"catch",species:"Kapr",lengthCm:70}], [{id:"post",sourceId:"catch",species:"Kapr",description:"Only species approved"},{id:"p2",sourceId:"c2",species:"Štika",lengthCm:80,weightKg:4,privateNote:"SECRET"}],{partial:true});
  assert.equal(result.statistics.catchCount,2);assert.equal(result.statistics.speciesCount,2);assert.equal(result.statistics.longestCm,80);assert.equal(result.statistics.heaviestKg,4);assert.equal(result.statistics.partial,true);
  assert.equal(result.trophies.length,1);assert.equal(result.trophies[0].id,"p2");assert.doesNotMatch(JSON.stringify(result),/sourceId|SECRET|description|sourceCatchId/);
});
test("incomplete species cannot fabricate species counts or public trophies",()=>{
  const result=publicFishingStats([{id:"quick",species:"Druh zatím neurčen",lengthCm:200,weightKg:20}],[]);
  assert.equal(result.statistics.catchCount,1);assert.equal(result.statistics.speciesCount,0);assert.equal(result.statistics.longestCm,null);assert.deepEqual(result.trophies,[]);
});
