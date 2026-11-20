import { normalizeCoordinates } from "../../catches/data/coordinates.js";

// Saved waters currently store one reference point, not a boundary polygon.
export const SAVED_WATER_MATCH_RADIUS_METERS = 300;
const EARTH_RADIUS_METERS = 6_371_000;

function validCoordinates(value) {
  if (!value || typeof value !== "object") return null;
  if ([value.latitude, value.longitude].some((coordinate) => coordinate === null || coordinate === undefined || String(coordinate).trim() === "")) return null;
  return normalizeCoordinates(value);
}

export function distanceBetweenCoordinatesMeters(first, second) {
  const a = validCoordinates(first);
  const b = validCoordinates(second);
  if (!a || !b) return null;
  const radians = (degrees) => degrees * (Math.PI / 180);
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = Math.min(1, Math.max(0, haversine));
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
}

export function findNearestSavedWater(coordinates, waters, maxDistanceMeters = SAVED_WATER_MATCH_RADIUS_METERS) {
  if (!validCoordinates(coordinates) || !Array.isArray(waters)) return null;
  const nearest = waters.reduce((result, water) => {
    if (!water?.id || !water?.name) return result;
    const distanceMeters = distanceBetweenCoordinatesMeters(coordinates, water.coordinates);
    if (distanceMeters === null || distanceMeters > maxDistanceMeters) return result;
    if (!result || distanceMeters < result.distanceMeters) return { water, distanceMeters };
    return result;
  }, null);
  return nearest ? { ...nearest, distanceMeters: Math.round(nearest.distanceMeters) } : null;
}

export function findNearbyCatalogueWaters(coordinates, waters) {
  return waters.flatMap(water => {
    const distance = distanceBetweenCoordinatesMeters(coordinates, water.coordinates);
    if (distance === null || distance > 25_000) return [];
    return [{ id: water.id, name: water.name, number: water.number, distance }];
  }).sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, 8)
    .map(({ distance, ...water }) => ({ ...water, approximateKm: Math.round(distance / 1000) }));
}
