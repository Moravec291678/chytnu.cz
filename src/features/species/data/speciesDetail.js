import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";

function getBiggestCatch(catches) {
  return catches.filter(isMeasuredCatchWeight)
    .reduce((best, item) => !best || item.weightKg > best.weightKg ? item : best, null);
}

export function getSpeciesDetail(catches, speciesKey) {
  const speciesCatches = catches.filter((item) => item.speciesKey === speciesKey)
    .sort((left, right) => {
      const leftTime = Date.parse(left.caughtAt);
      const rightTime = Date.parse(right.caughtAt);
      if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0;
      if (!Number.isFinite(rightTime)) return -1;
      return rightTime - leftTime;
    });
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


