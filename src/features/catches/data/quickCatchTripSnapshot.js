// A manual session measurement is useful context, never a new sensor reading.
export const TRIP_WATER_TEMPERATURE_MAX_AGE_MS = 4 * 60 * 60_000;
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const instant = value => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));

export function normalizeQuickCatchTripSnapshot(value) {
  if (!value || !id(value.tripId)) return null;
  const result = { tripId: value.tripId };
  if (Number.isSafeInteger(value.revision) && value.revision > 0) result.revision = value.revision;
  if (instant(value.updatedAt)) result.updatedAt = value.updatedAt;
  const measurement = value.waterTemperatureMeasurement;
  if (measurement?.source === "manual_trip" && typeof measurement.valueC === "number"
    && Number.isFinite(measurement.valueC) && measurement.valueC >= -10 && measurement.valueC <= 60 && instant(measurement.measuredAt)) {
    result.waterTemperatureMeasurement = { valueC: measurement.valueC, measuredAt: measurement.measuredAt, source: "manual_trip" };
  }
  return result;
}

export function isTripWaterTemperatureRelevant(measurement, caughtAt) {
  if (measurement?.source !== "manual_trip" || !instant(measurement.measuredAt) || !instant(caughtAt)) return false;
  const age = Date.parse(caughtAt) - Date.parse(measurement.measuredAt);
  return age >= 0 && age <= TRIP_WATER_TEMPERATURE_MAX_AGE_MS;
}
