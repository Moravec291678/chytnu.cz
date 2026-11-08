import { buildPrivateCatchMarkers, getCatchCoordinates } from "./catchMap.js";
import { isRecordVisible, validateDataScope } from "../../auth/data/localDataScope.js";
import { suggestedSpeciesForDisplay } from "../../ai/automaticSpecies.js";
import { getPrimaryAvailablePhoto } from "../../catches/data/catchPhotos.js";
import { LIVE_GPS_MAX_ACCURACY_METERS } from "../../catches/data/catchVerification.js";
import { distanceBetweenCoordinatesMeters } from "../../waters/data/nearbyWaterMatch.js";

const deleted = record => Boolean(record?.deletedAt || record?.deleted === true);
const owned = (record, scope) => isRecordVisible(record, scope.scopeKey) && (record?.ownerId ?? null) === scope.ownerId;

export function buildTripCatchMarkers(catches, trip, options) {
  let scope;
  try { scope = validateDataScope(options); } catch { return []; }
  if (typeof trip?.id !== "string" || !trip.id || deleted(trip) || !owned(trip, scope)) return [];
  const records = new Map();
  for (const record of Array.isArray(catches) ? catches : []) {
    if (typeof record?.id !== "string" || !record.id || !owned(record, scope)) continue;
    records.set(record.id, record);
  }
  const eligible = [...records.values()].filter(record => !deleted(record) && record.tripId === trip.id);
  const baseMarkers = new Map(buildPrivateCatchMarkers(eligible).map(marker => [marker.id, marker]));
  return eligible.flatMap(record => {
    // Null or blank structured values must never be coerced into a Gulf of Guinea pin.
    const structured = Number.isFinite(record.coordinates?.latitude) && Number.isFinite(record.coordinates?.longitude);
    const coordinates = getCatchCoordinates(structured ? record : { gpsLocation: record.gpsLocation });
    if (!coordinates || (coordinates.latitude === 0 && coordinates.longitude === 0)) return [];
    const accuracyMeters = record.locationEvidence?.accuracyMeters ?? record.verification?.gpsAccuracyMeters ?? null;
    if (record.gpsSource === "live-gps" && accuracyMeters !== null
      && (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0 || accuracyMeters > LIVE_GPS_MAX_ACCURACY_METERS)) return [];
    const photos = Array.isArray(record.photos) ? record.photos.filter(photo => photo && typeof photo === "object" && typeof photo.id === "string") : [];
    const suggestion = suggestedSpeciesForDisplay({ ...record, photos });
    const base = baseMarkers.get(record.id);
    return [{ ...base, species: suggestion?.label || (typeof record.species === "string" && record.species.trim() ? record.species : "Druh zatím neurčen"), aiSuggested: Boolean(suggestion),
      ...coordinates,
      weightKg: record.weightSource === "estimated" || !Number.isFinite(record.weightKg) || !(record.weightKg > 0) ? null : record.weightKg,
      lengthCm: Number.isFinite(record.lengthCm) && record.lengthCm > 0 ? record.lengthCm : null,
      photo: getPrimaryAvailablePhoto({ ...record, photos }),
      ownerId: scope.ownerId, scopeKey: scope.scopeKey, gpsSource: record.gpsSource ?? null,
      accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null }];
  }).sort((a, b) => (Date.parse(a.caughtAt) || 0) - (Date.parse(b.caughtAt) || 0) || a.id.localeCompare(b.id));
}

// Close or identical pins share a popup containing every catch; coordinates are never displaced.
export function groupNearbyTripMarkers(markers) {
  const groups = [];
  for (const marker of markers) {
    const group = groups.find(items => items.some(other => distanceBetweenCoordinatesMeters(other, marker) <= 3));
    if (group) group.push(marker); else groups.push([marker]);
  }
  return groups;
}

export function tripMapViewport(markers) {
  const points = markers.map(marker => [marker.latitude, marker.longitude]);
  return points.length === 0 ? null : points.length === 1 ? { center: points[0], zoom: 14 } : { bounds: points, maxZoom: 15 };
}
