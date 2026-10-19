import { normalizeCoordinates, parseCoordinateText } from "../../catches/data/coordinates.js";
import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";

export function getCatchCoordinates(record) {
  return normalizeCoordinates(record?.coordinates) ?? parseCoordinateText(record?.gpsLocation);
}

export function buildPrivateCatchMarkers(catches) {
  const personalRecord = catches.filter(isMeasuredCatchWeight)
    .reduce((best, record) => !best || record.weightKg > best.weightKg ? record : best, null);
  return catches.flatMap((record) => {
    const coordinates = getCatchCoordinates(record);
    if (!coordinates) return [];
    return [{
      id: record.id,
      species: record.species || "Úlovek",
      caughtAt: record.caughtAt,
      locationName: record.locationName || "",
      weightKg: Number.isFinite(record.weightKg) ? record.weightKg : null,
      weightSource: record.weightSource === "estimated" ? "estimated" : "manual",
      lengthCm: Number.isFinite(record.lengthCm) ? record.lengthCm : null,
      result: record.result ?? "unspecified",
      isPersonalRecord: record.id === personalRecord?.id,
      ...coordinates,
    }];
  });
}
