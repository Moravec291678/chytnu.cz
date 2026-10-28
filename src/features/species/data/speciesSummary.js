import { selectBestCatch } from "../../catches/data/catchSize.js";

export function selectSpeciesHighlight(catches) {
  if (!Array.isArray(catches) || catches.length === 0) return null;
  return selectBestCatch(catches) ?? catches[0];
}


