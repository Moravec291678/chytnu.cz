export const DEFAULT_PHOTO_FRAME = Object.freeze({ focalX: 0.5, focalY: 0.5, zoom: 1 });

function bounded(value, fallback, min, max) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function normalizePhotoFrame(photo = {}) {
  return {
    focalX: bounded(photo.focalX, DEFAULT_PHOTO_FRAME.focalX, 0, 1),
    focalY: bounded(photo.focalY, DEFAULT_PHOTO_FRAME.focalY, 0, 1),
    zoom: bounded(photo.zoom, DEFAULT_PHOTO_FRAME.zoom, 1, 2),
  };
}

export function hasCustomPhotoFrame(photo = {}) {
  return ["focalX", "focalY", "zoom"].some((key) => Object.prototype.hasOwnProperty.call(photo, key));
}

export function photoFrameStyle(photo = {}) {
  const frame = normalizePhotoFrame(photo);
  return {
    objectPosition: `${frame.focalX * 100}% ${frame.focalY * 100}%`,
    transform: `scale(${frame.zoom})`,
  };
}
