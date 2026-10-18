export function normalizeCoordinates(value) {
  if (!value || typeof value !== "object") return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function parseCoordinateText(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d+)?))\s*[,;]\s*([+-]?(?:\d+(?:\.\d+)?))$/);
  return match ? normalizeCoordinates({ latitude: match[1], longitude: match[2] }) : null;
}

export function formatCoordinates(value, precision = 6) {
  const coordinates = normalizeCoordinates(value);
  return coordinates ? `${coordinates.latitude.toFixed(precision)}, ${coordinates.longitude.toFixed(precision)}` : "";
}
