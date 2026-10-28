import { isMeasuredCatchWeight } from "./catchWeight.js";

export function hasCatchLength(record) {
  return Number.isFinite(record?.lengthCm) && record.lengthCm > 0;
}

/** Positive means left is the better size record: length first, weight as a tie-break/fallback. */
export function compareCatchSize(left, right) {
  const leftHasLength = hasCatchLength(left);
  const rightHasLength = hasCatchLength(right);
  if (leftHasLength !== rightHasLength) return leftHasLength ? 1 : -1;
  if (leftHasLength && left.lengthCm !== right.lengthCm) return left.lengthCm > right.lengthCm ? 1 : -1;
  const leftHasWeight = isMeasuredCatchWeight(left);
  const rightHasWeight = isMeasuredCatchWeight(right);
  if (leftHasWeight !== rightHasWeight) return leftHasWeight ? 1 : -1;
  if (leftHasWeight && left.weightKg !== right.weightKg) return left.weightKg > right.weightKg ? 1 : -1;
  return 0;
}

export function selectBestCatch(records) {
  return (records || []).reduce((best, record) => {
    if (!hasCatchLength(record) && !isMeasuredCatchWeight(record)) return best;
    return !best || compareCatchSize(record, best) > 0 ? record : best;
  }, null);
}
