import { getLocationAdapter } from "../../../platform/location/index.js";
import { distanceBetweenCoordinatesMeters } from "./nearbyWaterMatch.js";

export const WATER_NEARBY_RADIUS_METERS = 5000;
export const WATER_GPS_MAX_AGE_MS = 120000;
const CELL = 0.05, indexes = new WeakMap();
export function waterPoint(value) {
  return value && typeof value.latitude === "number" && typeof value.longitude === "number" && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180 ? {latitude:value.latitude,longitude:value.longitude} : null;
}
export function validateWaterPosition(position, now = Date.now()) {
  const coordinates = waterPoint(position?.coords), accuracyMeters = position?.coords?.accuracy, timestamp = position?.timestamp;
  if(!coordinates || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0 || accuracyMeters > 1000 || !Number.isFinite(timestamp) || now-timestamp > WATER_GPS_MAX_AGE_MS || timestamp-now > 5000) throw Object.assign(new Error("GPS nemá dostatečně čerstvý a přesný údaj. Zkus polohu znovu venku, nebo vyhledej revír názvem."),{code:"inaccurate"});
  return {coordinates,accuracyMeters,capturedAt:new Date(timestamp).toISOString()};
}
export async function requestWaterPosition({ adapter = getLocationAdapter(), now = Date.now } = {}) {
  if(!adapter.supported)throw new Error("Poloha není na tomto zařízení dostupná. Revír můžeš vyhledat názvem nebo číslem.");
  let position;
  try { position = await adapter.getCurrentPosition({enableHighAccuracy:true,timeout:10000,maximumAge:0}); }
  catch(error) { throw Object.assign(new Error(error?.code === 1 ? "Poloha nebyla povolena. Povol ji v nastavení prohlížeče, nebo vyhledej revír názvem." : "Polohu se nepodařilo získat. Zkus to znovu, nebo vyhledej revír názvem."),{code:error?.code === 1 ? "denied" : "unavailable"}); }
  return validateWaterPosition(position,now());
}
function spatialIndex(rows) {
  if(indexes.has(rows))return indexes.get(rows);
  const grid=new Map(), valid=[];
  for(const row of rows) {
    const point=waterPoint(row.coordinates); if(!point)continue;
    const item={row,point}, key=`${Math.floor(point.latitude/CELL)}:${Math.floor(point.longitude/CELL)}`;
    if(!grid.has(key))grid.set(key,[]); grid.get(key).push(item);valid.push(item);
  }
  const index={grid,valid};indexes.set(rows,index);return index;
}
// This index locates reference points only. It cannot establish membership in
// a water/river, fishing permission, or the user's actual fishing position.
export function nearbyWaterPoints(rows, evidence, {now=Date.now(),radiusMeters=WATER_NEARBY_RADIUS_METERS,limit=8} = {}) {
  const position=validateWaterPosition({coords:{...evidence?.coordinates,accuracy:evidence?.accuracyMeters},timestamp:Date.parse(evidence?.capturedAt)},now);
  const index=spatialIndex(rows), origin=position.coordinates, radius=Math.min(WATER_NEARBY_RADIUS_METERS,Math.max(0,radiusMeters))+position.accuracyMeters;
  const latitudeRange=radius/110000, longitudeRange=latitudeRange/Math.max(0.01,Math.cos(origin.latitude*Math.PI/180));
  let candidates=[];
  if(longitudeRange>2 || origin.longitude-longitudeRange < -180 || origin.longitude+longitudeRange > 180)candidates=index.valid;
  else for(let lat=Math.floor((origin.latitude-latitudeRange)/CELL);lat<=Math.floor((origin.latitude+latitudeRange)/CELL);lat++)for(let lon=Math.floor((origin.longitude-longitudeRange)/CELL);lon<=Math.floor((origin.longitude+longitudeRange)/CELL);lon++)candidates.push(...(index.grid.get(`${lat}:${lon}`) ?? []));
  return candidates.map(({row,point})=>({water:row,distanceMeters:Math.round(distanceBetweenCoordinatesMeters(origin,point)),accuracyMeters:position.accuracyMeters}))
    .filter(item=>item.distanceMeters<=radius).sort((a,b)=>a.distanceMeters-b.distanceMeters || a.water.id.localeCompare(b.water.id)).slice(0,Math.min(20,Math.max(0,limit)));
}
export function publicWaterMapLinks(coordinates) {
  const point=waterPoint(coordinates);if(!point)return null;
  const destination=`${point.latitude},${point.longitude}`;
  return {osm:`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=15/${point.latitude}/${point.longitude}`,navigation:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`};
}
export function applyDevicePositionIfEmpty(values, evidence) {
  if(values.coordinates || String(values.gpsLocation ?? "").trim())return values;
  return {...values,coordinates:evidence.coordinates,gpsLocation:`${evidence.coordinates.latitude.toFixed(6)}, ${evidence.coordinates.longitude.toFixed(6)}`,gpsSource:"live-gps",
    locationEvidence:{...evidence,source:"live-gps"}};
}
