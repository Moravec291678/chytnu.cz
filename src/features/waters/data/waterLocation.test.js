import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { validateWaterPosition, requestWaterPosition, nearbyWaterPoints, publicWaterMapLinks, waterPoint, applyDevicePositionIfEmpty } from "./waterLocation.js";
import { buildWaterOptions, applyActiveTripWater } from "./waterSelection.js";
import { distanceBetweenCoordinatesMeters } from "./nearbyWaterMatch.js";
import manifest from "./risManifest.json" with {type:"json"};

const now=Date.parse("2026-11-09T12:00:00Z"),point={latitude:50,longitude:14};
const evidence={coordinates:point,accuracyMeters:20,capturedAt:new Date(now).toISOString()};
test("confirmed active-trip water fills a new current catch only, preserving manual, historical and foreign contexts",()=>{
  const captured=new Date(2026,10,9,12,0), ownerId="angler", trip={id:"trip",ownerId,waterId:"water",startedAt:new Date(captured.getTime()-1000).toISOString()};
  const water={id:"water",ownerId,name:"Katalogový revír",waterNumber:"471 232",coordinates:point};
  const values={tripId:trip.id,catchDate:"2026-11-09",catchTime:"12:00",locationName:"",waterId:"",waterNumber:""};
  const options={ownerId,now:captured.getTime()};
  const filled=applyActiveTripWater(values,trip,[water],options);assert.equal(filled.waterId,"water");assert.equal(filled.waterNumber,"471232");assert.equal("coordinates" in filled,false);
  for(const changes of [{locationName:"Vlastní místo"},{waterNumber:"123"},{waterId:"jiný"},{catchDate:"2026-11-08"}]) {const manual={...values,...changes};assert.strictEqual(applyActiveTripWater(manual,trip,[water],options),manual);}
  assert.strictEqual(applyActiveTripWater(values,trip,[water],{...options,manualChoice:true}),values);
  assert.strictEqual(applyActiveTripWater(values,{...trip,ownerId:"jiný"},[water],options),values);
});
test("GPS lookup uses one explicit platform request and classifies denial, unavailable, inaccurate and stale fixes",async()=>{
  let calls=0;
  const adapter={supported:true,getCurrentPosition:async options=>{calls++;assert.equal(options.maximumAge,0);return {coords:{...point,accuracy:20},timestamp:now};}};
  const position=await requestWaterPosition({adapter,now:()=>now});assert.deepEqual(position,evidence);assert.equal(calls,1);
  await assert.rejects(requestWaterPosition({adapter:{supported:false}}),/není/);
  await assert.rejects(requestWaterPosition({adapter:{supported:true,getCurrentPosition:async()=>{throw {code:1};}}}),error=>error.code === "denied");
  await assert.rejects(requestWaterPosition({adapter:{supported:true,getCurrentPosition:async()=>{throw new Error("timeout");}}}),error=>error.code === "unavailable");
  for(const change of [{accuracy:0},{accuracy:1001},{latitude:91},{latitude:null}])assert.throws(()=>validateWaterPosition({coords:{...point,accuracy:20,...change},timestamp:now},now));
  for(const timestamp of [now-120001,now+5001,NaN])assert.throws(()=>validateWaterPosition({coords:{...point,accuracy:20},timestamp},now));
});
test("nearby candidates are ranked points, retain competing waters and never invent missing coordinates",()=>{
  const waters=[{id:"far",coordinates:{latitude:50,longitude:14.015}},{id:"a",coordinates:point},{id:"b",coordinates:{latitude:50,longitude:14.00001}},{id:"none",coordinates:null},{id:"invalid",coordinates:{latitude:null,longitude:14}},{id:"outside",coordinates:{latitude:51,longitude:14}}];
  const matches=nearbyWaterPoints(waters,evidence,{now});assert.deepEqual(matches.map(item=>item.water.id),["a","b","far"]);assert.equal(matches[0].distanceMeters,0);assert.equal(matches[0].accuracyMeters,20);
  assert.equal(nearbyWaterPoints([],evidence,{now}).length,0);assert.throws(()=>nearbyWaterPoints(waters,evidence,{now:now+120001}));
  assert.equal(waterPoint({latitude:null,longitude:null}),null);assert.deepEqual(waterPoint({latitude:0,longitude:0}),{latitude:0,longitude:0});
});
test("spatial index covers polar and date-line points without false large-distance exclusions",()=>{
  const position={coordinates:{latitude:89.99,longitude:179.99},accuracyMeters:30,capturedAt:evidence.capturedAt};
  assert.equal(nearbyWaterPoints([{id:"across",coordinates:{latitude:89.99,longitude:-179.99}}],position,{now})[0].water.id,"across");
});
test("context precedes proximity, matching personal/catalogue identities are deduplicated and expired GPS falls back safely",()=>{
  const catalogue=[{id:"ris-a",name:"A",number:"471001",coordinates:point},{id:"ris-b",name:"B",number:"471002",coordinates:{latitude:50,longitude:14.001}}];
  const personal=[{id:"own-b",catalogueId:"ris-b",name:"Moje B",waterNumber:"471002",isFavorite:true}];
  const result=buildWaterOptions({catalogue,personal,contextWaterId:"own-b",position:evidence,now});
  assert.equal(result.options[0].water.id,"own-b");assert.equal(result.options.filter(option=>option.water.id === "own-b").length,1);assert.equal(result.options.length,2);assert.ok(result.options.every(option=>option.distanceMeters !== undefined));
  const stale=buildWaterOptions({catalogue,personal,position:evidence,now:now+120001});assert.equal(stale.expired,true);assert.equal(stale.options.length,2);
  const search=buildWaterOptions({catalogue,personal,position:evidence,query:"471001",now});assert.equal(search.options.length,1);assert.equal(search.options[0].water.id,"ris-a");
});
test("device GPS fills only missing catch coordinates; public map/navigation links contain destination only",()=>{
  const own={coordinates:{latitude:49,longitude:15},gpsLocation:"49, 15",gpsSource:"manual-map",notes:"Ruční"};
  assert.strictEqual(applyDevicePositionIfEmpty(own,evidence),own);
  const filled=applyDevicePositionIfEmpty({notes:"Ruční"},evidence);assert.deepEqual(filled.coordinates,point);assert.equal(filled.locationEvidence.accuracyMeters,20);assert.equal(filled.notes,"Ruční");
  assert.equal(publicWaterMapLinks(null),null);const links=publicWaterMapLinks(point);assert.match(links.osm,/mlat=50&mlon=14/);assert.match(links.navigation,/destination=50%2C14/);assert.doesNotMatch(links.navigation,/origin|49|15/);
});
test("spatial lookups run offline over all 1451 catalogue rows and agree with a full exact scan",async()=>{
  const rows=JSON.parse(await readFile(new URL(`../../../../public/data/ris/${manifest.version}/index.json`,import.meta.url),"utf8"));
  assert.equal(rows.length,1451);const known=rows.filter(row=>waterPoint(row.coordinates));assert.equal(known.length,1263);
  const started=performance.now();
  for(const row of known.slice(0,100)) {
    const fix={...evidence,coordinates:row.coordinates};const matches=nearbyWaterPoints(rows,fix,{now});
    const exact=known.map(water=>({water,distanceMeters:Math.round(distanceBetweenCoordinatesMeters(row.coordinates,water.coordinates))})).filter(item=>item.distanceMeters<=5020).sort((a,b)=>a.distanceMeters-b.distanceMeters || a.water.id.localeCompare(b.water.id)).slice(0,8);
    assert.deepEqual(matches.map(item=>item.water.id),exact.map(item=>item.water.id));
  }
  const elapsed=performance.now()-started;assert.ok(elapsed<3000,`100 cached spatial lookups took ${Math.round(elapsed)} ms`);
  console.log(`RIS spatial check: 1451 rows, 1263 coordinate-bearing waters, 100 lookups in ${Math.round(elapsed)} ms; no network.`);
});
