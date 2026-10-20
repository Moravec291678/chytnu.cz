import { normalizeCoordinates } from "../../catches/data/coordinates.js";

export const CATCH_VISIBILITY = Object.freeze({ PRIVATE: "private", PUBLIC: "public" });
export const LOCATION_PRECISION = Object.freeze({ NONE: "none", APPROXIMATE: "approximate", EXACT: "exact" });
export const HEATMAP_GRANULARITY = Object.freeze({ CITY: "city", AREA: "area", OFF: "off" });

export const DEFAULT_PRIVACY_SETTINGS = Object.freeze({
  profileVisibility: "private",
  defaultCatchVisibility: CATCH_VISIBILITY.PRIVATE,
  defaultPhotoVisibility: CATCH_VISIBILITY.PRIVATE,
  defaultLocationPrecision: LOCATION_PRECISION.NONE,
  privateSpotDefault: true,
  nearbyOptIn: false,
  nearbyLocationPrecision: LOCATION_PRECISION.APPROXIMATE,
  heatmapOptIn: false,
  heatmapGranularity: HEATMAP_GRANULARITY.OFF,
});

export function normalizeCatchPrivacy(value) {
  const privateSpot = value?.privateSpot !== false;
  const legacyPrecision = value?.showExactLocation === true
    ? LOCATION_PRECISION.EXACT
    : value?.showLocation === true ? LOCATION_PRECISION.APPROXIMATE : LOCATION_PRECISION.NONE;
  const requestedPrecision = Object.values(LOCATION_PRECISION).includes(value?.locationPrecision)
    ? value.locationPrecision
    : legacyPrecision;
  return {
    visibility: value?.visibility === CATCH_VISIBILITY.PUBLIC ? CATCH_VISIBILITY.PUBLIC : CATCH_VISIBILITY.PRIVATE,
    photoVisibility: value?.photoVisibility === CATCH_VISIBILITY.PUBLIC ? CATCH_VISIBILITY.PUBLIC : CATCH_VISIBILITY.PRIVATE,
    locationPrecision: privateSpot ? LOCATION_PRECISION.NONE : requestedPrecision,
    privateSpot,
    nearbyEligible: !privateSpot && value?.nearbyEligible === true,
    heatmapEligible: !privateSpot && value?.heatmapEligible === true,
  };
}

export function normalizePrivacySettings(value) {
  const privateSpotDefault = value?.privateSpotDefault !== false;
  const legacyPrecision = value?.showExactLocation === true
    ? LOCATION_PRECISION.EXACT
    : value?.showLocation === true ? LOCATION_PRECISION.APPROXIMATE : LOCATION_PRECISION.NONE;
  const requestedPrecision = Object.values(LOCATION_PRECISION).includes(value?.defaultLocationPrecision)
    ? value.defaultLocationPrecision
    : legacyPrecision;
  const heatmapGranularity = Object.values(HEATMAP_GRANULARITY).includes(value?.heatmapGranularity)
    ? value.heatmapGranularity
    : value?.heatmapOptIn === true ? HEATMAP_GRANULARITY.AREA : HEATMAP_GRANULARITY.OFF;
  return {
    profileVisibility: value?.profileVisibility === "public" ? "public" : "private",
    defaultCatchVisibility: value?.defaultCatchVisibility === CATCH_VISIBILITY.PUBLIC
      ? CATCH_VISIBILITY.PUBLIC
      : CATCH_VISIBILITY.PRIVATE,
    defaultPhotoVisibility: value?.defaultPhotoVisibility === CATCH_VISIBILITY.PUBLIC
      ? CATCH_VISIBILITY.PUBLIC
      : CATCH_VISIBILITY.PRIVATE,
    defaultLocationPrecision: privateSpotDefault ? LOCATION_PRECISION.NONE : requestedPrecision,
    privateSpotDefault,
    nearbyOptIn: value?.nearbyOptIn === true,
    nearbyLocationPrecision: value?.nearbyLocationPrecision === LOCATION_PRECISION.NONE
      ? LOCATION_PRECISION.NONE
      : LOCATION_PRECISION.APPROXIMATE,
    heatmapOptIn: heatmapGranularity !== HEATMAP_GRANULARITY.OFF,
    heatmapGranularity,
  };
}

// Public location data is always reduced to a broad grid cell in this one place.
// Exact GPS remains in the private record only; raw `locationArea` is never trusted.
export function anonymizePublicCoordinates(value, precision) {
  if (precision !== LOCATION_PRECISION.APPROXIMATE) return null;
  const coordinates = normalizeCoordinates(value);
  if (!coordinates) return null;
  return `${coordinates.latitude.toFixed(1)}, ${coordinates.longitude.toFixed(1)}`;
}

export function createPublicCatchProjection(record) {
  const privacy = normalizeCatchPrivacy(record?.privacy);
  if (!record || privacy.visibility !== CATCH_VISIBILITY.PUBLIC) return null;
  return {
    species: record.species,
    speciesKey: record.speciesKey,
    caughtAt: record.caughtAt,
    weightKg: Number.isFinite(record.weightKg) ? record.weightKg : null,
    weightSource: record.weightSource === "estimated" ? "estimated" : "manual",
    lengthCm: Number.isFinite(record.lengthCm) ? record.lengthCm : null,
    photos: privacy.photoVisibility === CATCH_VISIBILITY.PUBLIC
      ? (record.photos ?? []).filter((photo) => photo.publicUrl).map((photo) => ({ type: photo.type, publicUrl: photo.publicUrl }))
      : [],
    ...(!privacy.privateSpot && !record.isPrivateLocation
      ? (() => {
          const locationArea = anonymizePublicCoordinates(record.coordinates, privacy.locationPrecision);
          return locationArea ? { locationArea } : {};
        })()
      : {}),
  };
}
