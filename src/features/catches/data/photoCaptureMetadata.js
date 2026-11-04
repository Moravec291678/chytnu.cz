export function normalizeCaptureDate(value, separateOffset) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z| UTC|[+-]\d{2}:?\d{2})?$/);
  if (match) {
    const [, year, month, day, hour, minute, second, milliseconds = "0", inlineOffset] = match;
    const offset = inlineOffset === " UTC" ? "Z" : inlineOffset ?? (typeof separateOffset === "string" ? separateOffset.trim() : null);
    const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
    if (Number(year) < 100 || calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() !== Number(month) - 1
      || calendar.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
    if (offset) {
      if (!/^(Z|[+-]\d{2}:?\d{2})$/.test(offset)) return null;
      if (offset !== "Z") {
        const hourOffset = Number(offset.slice(1, 3));
        const minuteOffset = Number(offset.slice(-2));
        if (hourOffset > 14 || minuteOffset > 59 || (hourOffset === 14 && minuteOffset !== 0)) return null;
      }
      const normalized = `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds.padEnd(3, "0").slice(0, 3)}${offset.length === 5 ? `${offset.slice(0, 3)}:${offset.slice(3)}` : offset}`;
      const timestamp = Date.parse(normalized);
      return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
    }
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(milliseconds.slice(0, 3).padEnd(3, "0")));
    return Number.isFinite(date.getTime()) && date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1
      && date.getDate() === Number(day) && date.getHours() === Number(hour) ? date.toISOString() : null;
  }
  return null;
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
    // Keep original date strings: exifr's Date reviver normalizes impossible calendar dates and drops offset tags.
    const tags = await parser.parse(source, { tiff: true, exif: true, gps: true, reviveValues: false, translateKeys: true, silentErrors: true });
    if (!tags) return null;
    const dateValue = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
    const dateOffset = tags.DateTimeOriginal ? tags.OffsetTimeOriginal ?? tags.OffsetTime
      : tags.CreateDate ? tags.OffsetTimeDigitized ?? tags.OffsetTime : tags.OffsetTime;
    const capturedAt = normalizeCaptureDate(dateValue, dateOffset);
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
