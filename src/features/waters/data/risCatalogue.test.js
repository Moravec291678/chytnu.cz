import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileRisExport } from "../../../../tools/import-ris-waters.mjs";
import { createRisCatalogue, RIS_MANIFEST } from "./risCatalogue.js";
import { filterCatalogue, findPersonalCatalogueWater } from "./risCatalogueModel.js";
import { createWaterRecord, updateWaterRecord } from "./waterModel.js";
import { waterRepository } from "./waterRepository.js";
import { toRemoteRecord } from "../../sync/data/firestoreSyncAdapter.js";
import { getWaterRelatedCatches } from "./waterDetailStats.js";
import { openLocalDatabase, APP_META_STORE_NAME, catchRepository } from "../../catches/data/catchRepository.js";
import { quickCaptureGenerationKey } from "../../catches/data/quickCaptureLifecycle.js";

const base = new URL(`../../../../public/data/ris/${RIS_MANIFEST.version}/`,import.meta.url);
const index = JSON.parse(await readFile(new URL("index.json",base),"utf8"));
const allDetails = Object.assign({},...await Promise.all("0123456789abcdef".split("").map(async key=>JSON.parse(await readFile(new URL(`details-${key}.json`,base),"utf8")))));
const original = Object.values(allDetails).map(value=>Object.fromEntries(Object.entries(value).filter(([key])=>!["id","fisheryType","union","description"].includes(key))));
const source = { complete:true,expectedCount:1451,detailsFailed:0,detailsFetched:1451,waters:original,errors:[] };
const scope = id => ({ownerId:id,scopeKey:`account:${id}`});

test("published catalogue contains 1451 unique source identities and complete untruncated details",()=>{
  assert.equal(index.length,1451); assert.equal(Object.keys(allDetails).length,1451);
  assert.equal(new Set(index.map(row=>row.id)).size,1451); assert.equal(new Set(index.map(row=>row.url)).size,1451);
  const compiled=compileRisExport(source), again=compileRisExport({...source,waters:[...source.waters].reverse()});
  assert.deepEqual(compiled.index,again.index); assert.equal(compiled.manifest.version,again.manifest.version);
  for(const row of compiled.details) assert.deepEqual(row.detail,allDetails[row.id].detail);
  assert.deepEqual(compiled.manifest.missing,{coordinates:188,areaHa:124,lengthKm:582});
  assert.equal(index.filter(row=>row.fisheryType==="Pstruhový").length,476);
  assert.equal(index.filter(row=>row.fisheryType==="Mimopstruhový").length,975);
  const duplicate=index.filter(row=>row.number.replace(/\s/g,"")==="4510091"); assert.equal(duplicate.length,2); assert.notEqual(duplicate[0].id,duplicate[1].id);
  assert.throws(()=>compileRisExport({...source,complete:false})); assert.throws(()=>compileRisExport({...source,waters:source.waters.slice(1)}));
  assert.throws(()=>compileRisExport({...source,waters:[{...original[0],url:"https://evil.example"},...original.slice(1)]}));
});
test("catalogue search ignores accents and number spacing and combines actual filters",()=>{
  const rows=filterCatalogue(index,{query:"hurysak"}); assert.ok(rows.length>=2);
  assert.equal(filterCatalogue(index,{query:"4510091"}).length,2); assert.equal(filterCatalogue(index,{query:"4 510 091"}).length,2);
  const filtered=filterCatalogue(index,{fisheryType:"Pstruhový",union:index.find(row=>row.fisheryType==="Pstruhový").union,withCoordinates:true});
  assert.ok(filtered.length); assert.ok(filtered.every(row=>row.coordinates&&row.fisheryType==="Pstruhový"));
});
test("catalogue cache survives reopen without network and failed requests remain retryable",async()=>{
  let calls=0;
  const online=createRisCatalogue({fetchImpl:async path=>{calls++;return {ok:true,json:async()=>JSON.parse(await readFile(new URL(path.split('/').at(-1),base),'utf8'))};}});
  await Promise.all([online.list(),online.list()]); assert.equal(calls,1);
  const selected=await online.get(index[0].id); assert.equal(selected.detail.pageText,allDetails[index[0].id].detail.pageText);
  const offline=createRisCatalogue({fetchImpl:async()=>{throw new Error("offline");}});
  assert.equal((await offline.list()).length,1451); assert.equal((await offline.get(index[0].id)).id,index[0].id);
  let unavailable=true; const retry=createRisCatalogue({storage:{read:async()=>null,write:async()=>{}},fetchImpl:async()=>{if(unavailable)throw new Error("offline");return {ok:true,json:async()=>index};}});
  await assert.rejects(retry.list()); unavailable=false; assert.equal((await retry.list()).length,1451);
  assert.equal(await retry.get("../private"),null);
});
test("personal selection is atomic/idempotent, owner scoped, syncable and linked to catches",async()=>{
  const a=scope("ris-owner-a"),b=scope("ris-owner-b"),row={...index[0],detail:allDetails[index[0].id].detail};
  const [first,repeated]=await Promise.all([waterRepository.selectCatalogueWater(row,a),waterRepository.selectCatalogueWater(row,a)]);
  assert.equal(first.id,repeated.id); assert.equal((await waterRepository.list(a)).length,1); assert.equal(first.type,"Neuvedeno");
  const edited=updateWaterRecord(first,{...first,name:"Moje soukromé jméno",notes:"Soukromá poznámka"}); await waterRepository.put(edited,a);
  const selected=await waterRepository.selectCatalogueWater({...row,name:"Aktualizovaný veřejný název"},a);
  assert.equal(selected.id,first.id); assert.equal(selected.name,edited.name); assert.equal(selected.notes,edited.notes);
  const other=await waterRepository.selectCatalogueWater(row,b); assert.notEqual(first.id,other.id); assert.equal(await waterRepository.get(first.id,b),null);
  const remote=toRemoteRecord("water",selected,a.ownerId);
  assert.equal(remote.catalogueId,row.id);
  assert.deepEqual(getWaterRelatedCatches(selected,[{id:"catch-linked",waterId:selected.id}], [selected]).map(record=>record.id),["catch-linked"]);
  await waterRepository.delete(first.id,a); const readded=await waterRepository.selectCatalogueWater(row,a); assert.notEqual(readded.id,first.id);
});
test("legacy personal water identity and all manual fields survive catalogue linking",async()=>{
  const s=scope("ris-legacy"),row=index.find(row=>row.numberUnique);
  const old=createWaterRecord({name:"Vlastní jméno",waterNumber:row.number,type:"Řeka",notes:"Nesmazat",coordinates:{latitude:49,longitude:15}},s);await waterRepository.put(old,s);
  const linked=await waterRepository.selectCatalogueWater(row,s);assert.equal(linked.id,old.id);assert.equal(linked.notes,"Nesmazat");assert.deepEqual(linked.coordinates,old.coordinates);assert.equal(linked.catalogueId,row.id);
  assert.equal(findPersonalCatalogueWater([{...old,waterNumber:"4 510 091"}],index.find(row=>!row.numberUnique)),null);
});
test("account cleanup generation fences a pending catalogue selection",async()=>{
  const s=scope("ris-cleanup"),generation=await catchRepository.getQuickCaptureGeneration(s),db=await openLocalDatabase();
  await new Promise((resolve,reject)=>{const tx=db.transaction(APP_META_STORE_NAME,"readwrite");tx.objectStore(APP_META_STORE_NAME).put({key:quickCaptureGenerationKey(s.scopeKey),generation:"new"});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  await assert.rejects(waterRepository.selectCatalogueWater(index[0],s,{generation}));assert.equal((await waterRepository.list(s)).length,0);
});
