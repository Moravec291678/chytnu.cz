import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";

export function selectSpeciesHighlight(catches) {
  if (!Array.isArray(catches) || catches.length === 0) return null;
  const measured = catches.filter(isMeasuredCatchWeight);
  if (measured.length === 0) return catches[0];
  return measured.reduce((largest, item) => item.weightKg > largest.weightKg ? item : largest);
}


