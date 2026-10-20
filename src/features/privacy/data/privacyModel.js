export const CATCH_VISIBILITY = Object.freeze({ PRIVATE: "private", PUBLIC: "public" });
export const LOCATION_PRECISION = Object.freeze({ NONE: "none", APPROXIMATE: "approximate", EXACT: "exact" });

export const DEFAULT_PRIVACY_SETTINGS = Object.freeze({
  profileVisibility: "private",
  defaultCatchVisibility: CATCH_VISIBILITY.PRIVATE,
  defaultPhotoVisibility: CATCH_VISIBILITY.PRIVATE,
  defaultLocationPrecision: LOCATION_PRECISION.NONE,
  privateSpotDefault: true,
  nearbyOptIn: false,
  nearbyLocationPrecision: LOCATION_PRECISION.APPROXIMATE,
  heatmapOptIn: false,
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
    heatmapOptIn: value?.heatmapOptIn === true,
  };
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
    ...(!privacy.privateSpot && privacy.locationPrecision !== LOCATION_PRECISION.NONE && record.locationArea
      ? { locationArea: record.locationArea }
      : {}),
  };
}
