import { formatCoordinates, normalizeCoordinates } from "./coordinates.js";

const DEFAULT_MAP_CENTER = Object.freeze({ latitude: 49.8, longitude: 15.5 });

export function resolveCatchMapStart(currentCoordinates, waterCoordinates) {
  const current = normalizeCoordinates(currentCoordinates);
  if (current) return { coordinates: current, zoom: 15 };
  const water = normalizeCoordinates(waterCoordinates);
  if (water) return { coordinates: water, zoom: 13 };
  return { coordinates: DEFAULT_MAP_CENTER, zoom: 7 };
}

export function applyManualMapLocation(formData, coordinates) {
  const point = normalizeCoordinates(coordinates);
  if (!point) throw new TypeError("Vybraná poloha není platná.");
  return {
    ...formData,
    coordinates: point,
    gpsLocation: formatCoordinates(point),
    gpsSource: "manual-map",
  };
}
