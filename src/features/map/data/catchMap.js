import { normalizeCoordinates, parseCoordinateText } from "../../catches/data/coordinates.js";

export function getCatchCoordinates(record) {
  return normalizeCoordinates(record?.coordinates) ?? parseCoordinateText(record?.gpsLocation);
}

export function buildPrivateCatchMarkers(catches) {
  return catches.flatMap((record) => {
    const coordinates = getCatchCoordinates(record);
    if (!coordinates) return [];
    return [{
      id: record.id,
      species: record.species || "Úlovek",
      caughtAt: record.caughtAt,
      locationName: record.locationName || "",
      weightKg: Number.isFinite(record.weightKg) ? record.weightKg : null,
      lengthCm: Number.isFinite(record.lengthCm) ? record.lengthCm : null,
      ...coordinates,
    }];
  });
}
