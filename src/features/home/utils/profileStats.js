import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";

export function getTopMethod(catches) {
  const groupMethods = catches.reduce((acc, item) => {
    if (!item.method?.key) return acc;
    const key = item.method.key;
    if (!acc[key]) {
      acc[key] = {
        key,
        label: item.method.label,
        count: 0,
      };
    }
    acc[key].count += 1;
    return acc;
  }, {});
  const groupMethodsArr = Object.values(groupMethods);
  return groupMethodsArr.reduce(
    (max, item) => {
      return max.count < item.count ? item : max;
    },
    { count: 0 },
  );
}

export function getCatchOutcomeStats(catches) {
  const knownResults = catches.filter((item) => item.result === "released" || item.result === "kept");
  if (knownResults.length === 0) return null;
  const released = knownResults.filter((item) => item.result === "released").length;
  const kept = knownResults.length - released;
  return {
    released,
    kept,
    known: knownResults.length,
    percentageReleased: Math.round((released / knownResults.length) * 100),
  };
}

export function getReleasedPercentage(catches) {
  return getCatchOutcomeStats(catches)?.percentageReleased ?? null;
}

export function getTopRevier(catches) {
  const groupLocations = catches.reduce((acc, item) => {
    const key = item.locationName?.trim();
    if (!key) return acc;
    if (!acc[key]) {
      acc[key] = {
        label: key,
        count: 0,
      };
    }
    acc[key].count += 1;
    return acc;
  }, {});
  const groupLocationsArr = Object.values(groupLocations);
  return groupLocationsArr.reduce(
    (max, item) => {
      return max.count < item.count ? item : max;
    },
    { count: 0 },
  );
}

export function getBiggestCatch(catches) {
  return catches.filter(isMeasuredCatchWeight)
    .reduce((max, item) => !max || item.weightKg > max.weightKg ? item : max, null);
}

export function getAvailableProfileStats(catches) {
  const stats = [];
  const biggestCatch = getBiggestCatch(catches);
  const topMethod = getTopMethod(catches);
  const topRevier = getTopRevier(catches);
  const releasedPercentage = getReleasedPercentage(catches);

  if (biggestCatch) stats.push({ key: "record", value: `${biggestCatch.weightKg} kg`, label: "REKORD", tone: "green" });
  if (topMethod.count > 0) stats.push({ key: "method", value: `${topMethod.count}×`, label: topMethod.label?.toUpperCase() || "METODA", tone: "gold" });
  if (topRevier.count > 0) stats.push({ key: "location", value: `${topRevier.count}×`, label: topRevier.label.toUpperCase(), tone: "blue" });
  if (releasedPercentage !== null) stats.push({ key: "released", value: `${releasedPercentage}%`, label: "PUŠTĚNO", tone: "green" });

  return stats;
}


