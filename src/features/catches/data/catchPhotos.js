export const MAX_PHOTOS_PER_CATCH = 10;

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
