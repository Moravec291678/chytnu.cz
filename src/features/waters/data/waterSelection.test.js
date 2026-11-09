import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { searchWaterSuggestions, rankPersonalWaters, applyWaterToFishingForm, prefillWaterEditor } from "./waterSelection.js";
import manifest from "./risManifest.json" with {type:"json"};
import { waterRepository } from "./waterRepository.js";
import { createTripRecord } from "../../trips/data/tripModel.js";
import { buildQuickCatchContext } from "../../catches/data/quickCatchEnrichment.js";
import { getWaterRelatedCatches } from "./waterDetailStats.js";
import { buildGalleryItems, filterAndSortGallery } from "../../catches/data/catchGallery.js";
import { catchDraftRepository } from "../../catches/data/catchDraftRepository.js";

const rows=JSON.parse(await readFile(new URL(`../../../../public/data/ris/${manifest.version}/index.json`,import.meta.url),"utf8"));
test("indexed autocomplete matches partial names/numbers, mixed case and Czech accents",()=>{
  assert.ok(searchWaterSuggestions(rows,"471").length);
  assert.ok(searchWaterSuggestions(rows,"mORaVa").every(row=>row.name.toLowerCase().includes("morava")));
  assert.ok(searchWaterSuggestions(rows,"mORaVa").length);
  assert.ok(searchWaterSuggestions(rows,"hurysak").length>=2);
  assert.deepEqual(searchWaterSuggestions(rows,"471232").map(row=>row.id),searchWaterSuggestions(rows,"471 232").map(row=>row.id));
  assert.equal(searchWaterSuggestions(rows,"nenalezitelný revír xyz").length,0);
  assert.equal(searchWaterSuggestions(rows,"").length,1451);
});
test("favourites precede actually used waters and alphabetical catalogue fallback",()=>{
  const personal=[{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C",isFavorite:true}];
  assert.deepEqual(rankPersonalWaters(personal,["b","a"]).map(row=>row.id),["c","b","a"]);
  assert.deepEqual(personal.map(row=>row.id),["a","b","c"]);
});
test("selection fills blanks and replaces previous automatic water fields without altering manual data or GPS",()=>{
  const old={id:"old",name:"Původní revír",waterNumber:"471 001"},water={id:"new",name:"Nový revír",waterNumber:"471 232",coordinates:{latitude:49,longitude:15}};
  const manual={waterId:old.id,locationName:"Moje tajné místo",waterNumber:"123",coordinates:{latitude:50,longitude:14},gpsSource:"manual-map",notes:"Nesmazat"};
  const selected=applyWaterToFishingForm(manual,water,old,{includeNumber:true});
  assert.deepEqual(selected,{...manual,waterId:water.id});
  const automatic=applyWaterToFishingForm({...manual,locationName:old.name,waterNumber:"471001"},water,old,{includeNumber:true});
  assert.equal(automatic.locationName,water.name);assert.equal(automatic.waterNumber,"471232");assert.deepEqual(automatic.coordinates,manual.coordinates);
  assert.equal(applyWaterToFishingForm({},water).locationName,water.name);assert.equal("coordinates" in applyWaterToFishingForm({},water),false);
  assert.equal(applyWaterToFishingForm(manual,null).waterId,"");
});
test("water editor preserves dirty manual fields while prefilling supported source fields",()=>{
  const values={name:"Vlastní název",type:"Rybník",notes:"Ruční poznámky",targetFish:["Kapr"]};
  const water={name:"Oficiální revír",waterNumber:"471 232",type:"Neuvedeno",area:"Svaz",notes:null,targetFish:[]};
  const result=prefillWaterEditor(values,water,new Set(["name","notes","targetFish"]));
  assert.equal(result.name,values.name);assert.equal(result.notes,values.notes);assert.deepEqual(result.targetFish,values.targetFish);assert.equal(result.waterNumber,water.waterNumber);assert.equal(result.type,"Neuvedeno");
});
test("draft reopen retains the consumed navigation request, canonical selection and manual locality",async()=>{
  const scope={ownerId:"selector-draft",scopeKey:"account:selector-draft"};
  const data={waterId:"changed-water",locationName:"Ručně zadané místo",waterNumber:"471232",coordinates:{latitude:50,longitude:14},photos:[]};
  const consumedWaterRequest=JSON.stringify([scope.scopeKey,"navigation-key","initial-water"]);
  await catchDraftRepository.save(data,{consumedWaterRequest},scope);
  const restored=await catchDraftRepository.get(scope);
  assert.equal(restored.uiState.consumedWaterRequest,consumedWaterRequest);assert.equal(restored.data.waterId,"changed-water");assert.equal(restored.data.locationName,data.locationName);assert.deepEqual(restored.data.coordinates,data.coordinates);
});
test("catalogue selection flows through trip, Quick Catch, catch references and gallery filtering offline",async()=>{
  const scope={ownerId:"selector-owner",scopeKey:"account:selector-owner"},row=rows.find(row=>row.number==="471 232");
  const water=await waterRepository.selectCatalogueWater(row,scope);
  const form=applyWaterToFishingForm({startedAt:"2026-11-09T08:00:00Z",locationName:""},water);
  const trip={...createTripRecord(form,new Date("2026-11-09T09:00:00Z")),ownerId:scope.ownerId};
  const context=buildQuickCatchContext({trip,waters:await waterRepository.list(scope),capturedAt:"2026-11-09T10:00:00Z"});
  assert.equal(context.values.waterId,water.id);assert.equal(context.values.waterNumber,471232);assert.equal(context.values.locationName,water.name);assert.equal("coordinates" in context.values,false);
  const catchRecord={id:"selector-catch",...context.values,caughtAt:"2026-11-09T10:00:00Z",photos:[{id:"photo",blob:new Blob(["fixture"])}]};
  assert.equal(getWaterRelatedCatches(water,[catchRecord],[water]).length,1);
  assert.equal(filterAndSortGallery(buildGalleryItems([catchRecord]),{waterKey:`id:${water.id}`}).length,1);
  const repeated=await waterRepository.selectCatalogueWater(row,scope);assert.equal(repeated.id,water.id);
  const wrongOwnerContext=buildQuickCatchContext({trip,waters:[{...water,ownerId:"another"}],capturedAt:"2026-11-09T10:00:00Z"});assert.equal(wrongOwnerContext.values.waterId,undefined);
});
