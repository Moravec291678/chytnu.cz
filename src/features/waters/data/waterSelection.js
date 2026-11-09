import { normalizeText } from "../../../shared/utils/helpers.js";

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
