export const PHOTO_VARIANTS = Object.freeze({
  card: Object.freeze({ edge: 384, quality: 78, maxBytes: 512 * 1024 }),
  gallery: Object.freeze({ edge: 800, quality: 81, maxBytes: 1024 * 1024 }),
  detail: Object.freeze({ edge: 1600, quality: 84, maxBytes: 3 * 1024 * 1024 }),
});

export function getPhotoVariant(name) {
  return typeof name === "string" && Object.hasOwn(PHOTO_VARIANTS, name) ? PHOTO_VARIANTS[name] : null;
}
