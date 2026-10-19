import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";

function getBiggestCatch(catches) {
  return catches.filter(isMeasuredCatchWeight)
    .reduce((best, item) => !best || item.weightKg > best.weightKg ? item : best, null);
}

export function getSpeciesDetail(catches, speciesKey) {
  const speciesCatches = catches.filter((item) => item.speciesKey === speciesKey)
    .sort((left, right) => Date.parse(right.caughtAt) - Date.parse(left.caughtAt));
  const biggestCatch = getBiggestCatch(speciesCatches);
  const longestCatch = speciesCatches.filter((item) => Number.isFinite(item.lengthCm))
    .reduce((best, item) => !best || item.lengthCm > best.lengthCm ? item : best, null);

  return {
    catches: speciesCatches,
    biggestCatch,
    longestCatch,
    personalRecord: getBiggestCatch(catches),
  };
}


