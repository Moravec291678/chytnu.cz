import { PRODUCT_LIMITS } from "../../../product/config/limits.js";

export const MAX_PHOTOS_PER_CATCH = PRODUCT_LIMITS.photosPerCatch;
export const MAX_LEGACY_PHOTOS_PER_CATCH = PRODUCT_LIMITS.legacyPhotosPerCatch;

export function getPrimaryPhoto(record) {
  const photos = Array.isArray(record?.photos) ? record.photos : [];
  return photos.find((photo) => photo.id === record?.primaryPhotoId) ?? photos[0] ?? null;
}

export function getPrimaryAvailablePhoto(record) {
  const primary = getPrimaryPhoto(record);
  return primary?.blob ? primary : (record?.photos ?? []).find((photo) => photo.blob) ?? primary;
}

export function normalizePrimaryPhotoId(photos, primaryPhotoId) {
  if (!photos.length) return null;
  return photos.some((photo) => photo.id === primaryPhotoId) ? primaryPhotoId : photos[0].id;
}
