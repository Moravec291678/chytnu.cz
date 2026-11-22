import { normalizeCoordinates, parseCoordinateText } from "../../catches/data/coordinates.js";
import { selectBestCatch } from "../../catches/data/catchSize.js";

export function getCatchCoordinates(record) {
  return normalizeCoordinates(record?.coordinates) ?? parseCoordinateText(record?.gpsLocation);
}

export function buildPrivateCatchMarkers(catches) {
  const personalRecord = selectBestCatch(catches);
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

// Group only visible points into fixed screen cells. Keep the original position of
// every catch and use the first actual point as the anchor for a group.
const MAP_CELL_PIXELS = 48;
export function groupVisibleCatchMarkers(markers, project, { x: width, y: height }) {
  const groups = new Map();
  for (const marker of markers) {
    const { x, y } = project([marker.latitude, marker.longitude]);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const cell = `${Math.floor(x / MAP_CELL_PIXELS)}:${Math.floor(y / MAP_CELL_PIXELS)}`;
    const group = groups.get(cell);
    if (group) group.push(marker);
    else groups.set(cell, [marker]);
  }
  return [...groups.values()];
}
