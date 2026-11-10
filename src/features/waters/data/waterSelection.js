import { normalizeText } from "../../../shared/utils/helpers.js";
import { nearbyWaterPoints } from "./waterLocation.js";

const digits = value => String(value ?? "").replace(/\s/g, "");
const indexes = new WeakMap();
function indexed(rows) {
  if (!indexes.has(rows)) indexes.set(rows, rows.map(row => ({ row, name:normalizeText(row.name), number:digits(row.number ?? row.waterNumber) })));
  return indexes.get(rows);
}
export function searchWaterSuggestions(rows, query = "") {
  const text = normalizeText(query), numeric = /^\d[\d\s]*$/.test(text) ? digits(text) : null;
  const terms = text.split(" ").filter(Boolean);
  return indexed(rows).filter(item => numeric ? item.number.includes(numeric) : terms.every(term => `${item.name} ${item.number}`.includes(term))).map(item => item.row);
}
export function rankPersonalWaters(waters, recentIds = []) {
  const recent = new Map(); recentIds.forEach((id,index) => { if(id && !recent.has(id))recent.set(id,index); });
  return [...waters].sort((a,b) => Number(Boolean(b.isFavorite))-Number(Boolean(a.isFavorite)) || (recent.get(a.id) ?? Infinity)-(recent.get(b.id) ?? Infinity) || a.name.localeCompare(b.name,"cs"));
}
// Explicit water selection changes the canonical relation. Fill blank fields or
// values inherited from the previous water; preserve independent manual edits.
export function applyWaterToFishingForm(values, water, previousWater = null, { includeNumber = false } = {}) {
  if (!water?.id) return { ...values, waterId:"" };
  const result = { ...values, waterId:water.id };
  if (!String(values.locationName ?? "").trim() || values.locationName === previousWater?.name) result.locationName = water.name;
  if (includeNumber && (!String(values.waterNumber ?? "").trim() || digits(values.waterNumber) === digits(previousWater?.waterNumber))) result.waterNumber = String(water.waterNumber ?? "").replace(/\D/g,"");
  return result;
}
export function prefillWaterEditor(values, water, dirtyKeys = new Set()) {
  const result = { ...values };
  for(const key of ["name","waterNumber","type","area","notes","targetFish"]) if(!dirtyKeys.has(key)) result[key] = water[key] ?? (key === "targetFish" ? [] : "");
  return result;
}

export function applyActiveTripWater(values, trip, waters, {ownerId=null,manualChoice=false,now=Date.now()} = {}) {
  if(manualChoice || values.waterId || String(values.locationName ?? "").trim() || String(values.waterNumber ?? "").trim() || !trip?.id || trip.endedAt || values.tripId !== trip.id || (trip.ownerId ?? null) !== ownerId)return values;
  const captured=Date.parse(`${values.catchDate}T${values.catchTime}`), started=Date.parse(trip.startedAt);
  // New form times have minute precision; allow that minute, never an older
  // historical photograph/session or a future timestamp to inherit this trip.
  if(!Number.isFinite(captured) || !Number.isFinite(started) || captured+59999 < started || captured > now+60000)return values;
  const water=waters.find(item=>item.id === trip.waterId && !item.deleted && (item.ownerId ?? null) === ownerId);
  return water ? applyWaterToFishingForm(values,water,null,{includeNumber:true}) : values;
}

export function buildWaterOptions({catalogue = [],personal = [],query = "",recentIds = [],contextWaterId = "",position = null,now = Date.now()}) {
  const byId=new Map(catalogue.map(row=>[row.id,row])), saved=new Map(personal.filter(water=>water.catalogueId).map(water=>[water.catalogueId,water]));
  const candidates=new Map();
  const add=(water,kind,extra={})=>{
    const key=kind === "personal" ? water.catalogueId || `personal:${water.id}` : water.id;
    const own=kind === "catalogue" ? saved.get(water.id) : water;
    const item={kind:own ? "personal" : kind,water:own || water,type:byId.get(own?.catalogueId)?.fisheryType ?? water.fisheryType ?? water.type,...extra};
    const current=candidates.get(key);if(!current || item.distanceMeters !== undefined && (current.distanceMeters === undefined || item.distanceMeters < current.distanceMeters))candidates.set(key,item);
  };
  for(const water of searchWaterSuggestions(rankPersonalWaters(personal,recentIds),query))add(water,"personal");
  for(const water of searchWaterSuggestions(catalogue,query).sort((a,b)=>a.name.localeCompare(b.name,"cs")))add(water,"catalogue");
  let nearbyCount=0,expired=false;
  if(position)try {
    for(const [rows,kind,source] of [[catalogue,"catalogue","bod RIS"],[personal,"personal","osobní bod"]])for(const match of nearbyWaterPoints(rows,position,{now})) {
      if(!searchWaterSuggestions([match.water],query).length)continue;
      add(match.water,kind,{distanceMeters:match.distanceMeters,distanceSource:source});nearbyCount++;
    }
  } catch {expired=true;}
  const recent=new Map(recentIds.map((id,index)=>[id,index]));
  const options=[...candidates.values()].sort((a,b)=>Number(b.water.id === contextWaterId)-Number(a.water.id === contextWaterId)
    || Number(b.distanceMeters !== undefined)-Number(a.distanceMeters !== undefined) || (a.distanceMeters ?? Infinity)-(b.distanceMeters ?? Infinity)
    || Number(b.kind === "personal")-Number(a.kind === "personal") || Number(Boolean(b.water.isFavorite))-Number(Boolean(a.water.isFavorite))
    || (recent.get(a.water.id) ?? Infinity)-(recent.get(b.water.id) ?? Infinity) || a.water.name.localeCompare(b.water.name,"cs"));
  return {options:options.slice(0,32),nearbyCount,expired};
}
