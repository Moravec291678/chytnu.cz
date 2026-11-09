import { normalizeText } from "../../../shared/utils/helpers.js";

export const validCatalogueId = id => /^ris-[a-f0-9]{24}$/.test(id ?? "");
const number = value => String(value ?? "").replace(/\s/g, "");
export function filterCatalogue(rows, { query = "", fisheryType = "", union = "", withCoordinates = false } = {}) {
  const terms = normalizeText(query).split(" ").filter(Boolean), digits = /^\d[\d\s]*$/.test(query.trim()) ? number(query) : null;
  return rows.filter(row => (!fisheryType || row.fisheryType === fisheryType) && (!union || row.union === union) && (!withCoordinates || row.coordinates)
    && (digits ? number(row.number).includes(digits) : terms.every(term => normalizeText([row.name,row.number,row.fisheryType,row.union,row.description].filter(Boolean).join(" ")).includes(term))))
    .sort((a,b)=>a.name.localeCompare(b.name,"cs") || a.id.localeCompare(b.id));
}
export function findPersonalCatalogueWater(waters, row) {
  const direct = waters.find(water => water.catalogueId === row.id);
  if (direct) return direct;
  const sameNumber = waters.filter(water => !water.catalogueId && number(water.waterNumber) === number(row.number));
  const exact = sameNumber.filter(water => normalizeText(water.name) === normalizeText(row.name));
  if (exact.length === 1) return exact[0];
  return row.numberUnique && sameNumber.length === 1 ? sameNumber[0] : null;
}
