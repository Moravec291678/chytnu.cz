function normalizeCaptureDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-]\d{2}:?\d{2}))?$/);
  if (match) {
    const [, year, month, day, hour, minute, second, milliseconds = "0", offset] = match;
    if (offset) {
      const normalized = `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds.padEnd(3, "0").slice(0, 3)}${offset.length === 5 ? `${offset.slice(0, 3)}:${offset.slice(3)}` : offset}`;
      const timestamp = Date.parse(normalized);
      return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
    }
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(milliseconds.slice(0, 3).padEnd(3, "0")));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function validCoordinate(value, maximum) {
  return Number.isFinite(value) && Math.abs(value) <= maximum;
}

export async function readPhotoCaptureMetadata(file) {
  if (!file || typeof file.arrayBuffer !== "function") return null;
  try {
    const exifr = await import("exifr");
    const parser = exifr.default ?? exifr;
    const source = typeof FileReader === "undefined" ? new Uint8Array(await file.arrayBuffer()) : file;
    const tags = await parser.parse(source, { tiff: true, exif: true, gps: true, reviveValues: true, translateKeys: true, silentErrors: true });
    if (!tags) return null;
    const capturedAt = normalizeCaptureDate(tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate);
    const rawLatitude = tags.latitude ?? tags.GPSLatitude;
    const rawLongitude = tags.longitude ?? tags.GPSLongitude;
    let latitude = rawLatitude === null || rawLatitude === undefined ? Number.NaN : Number(rawLatitude);
    let longitude = rawLongitude === null || rawLongitude === undefined ? Number.NaN : Number(rawLongitude);
    if (!validCoordinate(latitude, 90) || !validCoordinate(longitude, 180)) {
      const gps = await parser.gps(source).catch(() => null);
      latitude = Number(gps?.latitude);
      longitude = Number(gps?.longitude);
    }
    const coordinates = validCoordinate(latitude, 90) && validCoordinate(longitude, 180)
      ? { latitude, longitude }
      : null;
    return capturedAt || coordinates ? { capturedAt, coordinates } : null;
  } catch {
    return null;
  }
}
