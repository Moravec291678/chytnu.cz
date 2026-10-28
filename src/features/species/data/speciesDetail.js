import { selectBestCatch } from "../../catches/data/catchSize.js";
import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { isCatchDateEligibleForProgression } from "../../catches/data/catchVerification.js";

function getBiggestCatch(catches, now) {
  return selectBestCatch(catches.filter((record) => isCatchDateEligibleForProgression(record, now)));
}

export function getSpeciesDetail(catches, speciesKey, now = new Date()) {
  const speciesCatches = catches.filter((item) => item.speciesKey === speciesKey)
    .sort((left, right) => {
      const leftTime = Date.parse(left.caughtAt);
      const rightTime = Date.parse(right.caughtAt);
      if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0;
      if (!Number.isFinite(rightTime)) return -1;
      return rightTime - leftTime;
    });
  const biggestCatch = getBiggestCatch(speciesCatches, now);
  const heaviestCatch = speciesCatches.filter((item) => isCatchDateEligibleForProgression(item, now) && isMeasuredCatchWeight(item))
    .reduce((best, item) => !best || item.weightKg > best.weightKg ? item : best, null);
  const longestCatch = speciesCatches.filter((item) => isCatchDateEligibleForProgression(item, now) && Number.isFinite(item.lengthCm) && item.lengthCm > 0)
    .reduce((best, item) => !best || item.lengthCm > best.lengthCm ? item : best, null);

  return {
    catches: speciesCatches,
    biggestCatch,
    heaviestCatch,
    longestCatch,
    personalRecord: getBiggestCatch(catches, now),
  };
}


