import { PRODUCT_LIMITS } from "../../../product/config/limits.js";

export const TRIP_BOTTOM_TYPES = Object.freeze(["mud", "sand", "gravel", "rocks"]);
export const TRIP_ENVIRONMENT_FIELDS = Object.freeze(["waterDepthM", "bottomType", "waterTemperatureMeasurement"]);

function optionalNumber(value, label, min, max) {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim().replace(",", ".")) : NaN;
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label}: zadej číslo od ${min} do ${max}.`);
  return number;
}

export function normalizeTripDefaults(data) {
  const waterId = data.waterId || null;
  if (waterId !== null && (typeof waterId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(waterId))) throw new Error("Vyber platný uložený revír.");
  const baitKeys = data.baitKeys ?? [];
  if (!Array.isArray(baitKeys) || baitKeys.length > 5 || baitKeys.some(key => typeof key !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(key))) throw new Error("Vyber nejvýše pět platných nástrah.");
  const waterDepthM = optionalNumber(data.waterDepthM, "Hloubka lovu", 0, PRODUCT_LIMITS.catch.depthM);
  const bottomType = data.bottomType || null;
  if (bottomType !== null && !TRIP_BOTTOM_TYPES.includes(bottomType)) throw new Error("Vyber platný typ dna.");
  let measurement = data.waterTemperatureMeasurement ?? null;
  if (Object.hasOwn(data, "waterTempC")) {
    const valueC = optionalNumber(data.waterTempC, "Teplota vody", PRODUCT_LIMITS.catch.waterTempC.min, PRODUCT_LIMITS.catch.waterTempC.max);
    measurement = valueC === null ? null : { valueC, measuredAt: data.waterTempMeasuredAt, source: "manual_trip" };
  }
  let waterTemperatureMeasurement = null;
  if (measurement !== null) {
    if (!measurement || typeof measurement !== "object" || Array.isArray(measurement)
      || Object.keys(measurement).some(key => !["valueC", "measuredAt", "source"].includes(key))
      || measurement.source !== "manual_trip") throw new Error("Teplotu vody lze převzít jen z ručního měření vycházky.");
    const valueC = optionalNumber(measurement.valueC, "Teplota vody", PRODUCT_LIMITS.catch.waterTempC.min, PRODUCT_LIMITS.catch.waterTempC.max);
    if (valueC === null || typeof measurement.measuredAt !== "string" || !Number.isFinite(Date.parse(measurement.measuredAt))) throw new Error("Zadej čas měření teploty vody.");
    waterTemperatureMeasurement = { valueC, measuredAt: new Date(measurement.measuredAt).toISOString(), source: "manual_trip" };
  }
  return { waterId, baitKeys: [...new Set(baitKeys)], waterDepthM, bottomType, waterTemperatureMeasurement };
}

export function createTripRecord(data, now = new Date()) {
  const timestamp = now.toISOString();
  const title = data.title?.trim() || `Vycházka · ${now.toLocaleDateString("cs-CZ")}`;
  if (title.length > 80) throw new Error("Zadej název vycházky do 80 znaků.");
  if ((data.locationName?.trim().length ?? 0) > 120) throw new Error("Lokalita může mít nejvýše 120 znaků.");
  const start = data.startedAt ? Date.parse(data.startedAt) : now.getTime();
  if (!Number.isFinite(start)) throw new Error("Zadej platný začátek vycházky.");
  if (start > now.getTime()) throw new Error("Začátek aktivní vycházky nemůže být v budoucnosti.");
  const defaults = normalizeTripDefaults(data);
  if (defaults.waterTemperatureMeasurement && Date.parse(defaults.waterTemperatureMeasurement.measuredAt) > now.getTime()) throw new Error("Čas měření teploty vody nemůže být v budoucnosti.");
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    locationName: data.locationName?.trim() ?? "",
    methodKey: data.methodKey || null,
    ...defaults,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: new Date(start).toISOString(),
    endedAt: null,
    sync: { status: "local", revision: 1 },
  };
}

export function endTripRecord(trip, now = new Date()) {
  if (trip.endedAt) throw new Error("Tato vycházka už byla ukončena.");
  if (now.getTime() < Date.parse(trip.startedAt)) throw new Error("Konec vycházky nemůže být před začátkem.");
  return {
    ...trip,
    endedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    sync: { ...(trip.sync ?? {}), status: "local", revision: (trip.sync?.revision ?? 0) + 1 },
  };
}

export function tripToForm(trip) {
  const localTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };
  return {
    title: trip.title ?? "", locationName: trip.locationName ?? "", methodKey: trip.methodKey ?? "",
    waterId: trip.waterId ?? "", baitKeys: [...(trip.baitKeys ?? [])],
    waterDepthM: trip.waterDepthM ?? "", bottomType: trip.bottomType ?? "",
    waterTempC: trip.waterTemperatureMeasurement?.valueC ?? "", waterTempMeasuredAt: localTime(trip.waterTemperatureMeasurement?.measuredAt),
    startedAt: localTime(trip.startedAt), endedAt: localTime(trip.endedAt),
  };
}

export function updateTripRecord(trip, values, now = new Date()) {
  const title = values.title?.trim();
  if (!title || title.length > 80) throw new Error("Zadej název vycházky do 80 znaků.");
  const locationName = values.locationName?.trim() ?? "";
  if (locationName.length > 120) throw new Error("Lokalita může mít nejvýše 120 znaků.");
  const previousForm = tripToForm(trip);
  const timestamp = (value, original, previousValue, label) => {
    // Preserve the original instant, including milliseconds/DST offset, when
    // the user only edited text fields.
    if (value === previousValue) return original;
    if (!value || !Number.isFinite(Date.parse(value))) throw new Error(`Zadej platný ${label} vycházky.`);
    return new Date(value).toISOString();
  };
  const startedAt = timestamp(values.startedAt, trip.startedAt, previousForm.startedAt, "začátek");
  const endedAt = trip.endedAt ? timestamp(values.endedAt, trip.endedAt, previousForm.endedAt, "konec") : null;
  if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) throw new Error("Konec vycházky nemůže být před začátkem.");
  if (!endedAt && Date.parse(startedAt) > now.getTime()) throw new Error("Začátek aktivní vycházky nemůže být v budoucnosti.");
  const defaultsInput = { ...trip, ...values };
  // Keep the exact original measurement instant through unchanged local-time
  // fields, including the repeated hour at the autumn DST transition.
  if (Object.hasOwn(values, "waterTempC") && values.waterTempMeasuredAt === previousForm.waterTempMeasuredAt && trip.waterTemperatureMeasurement) {
    defaultsInput.waterTempMeasuredAt = trip.waterTemperatureMeasurement.measuredAt;
  }
  const defaults = normalizeTripDefaults(defaultsInput);
  if (defaults.waterTemperatureMeasurement && Date.parse(defaults.waterTemperatureMeasurement.measuredAt) > now.getTime()) throw new Error("Čas měření teploty vody nemůže být v budoucnosti.");
  return {
    ...trip, title, locationName, methodKey: values.methodKey || null, startedAt, endedAt,
    ...defaults,
    updatedAt: now.toISOString(),
    sync: { ...(trip.sync ?? {}), status: "local", revision: (trip.sync?.revision ?? 0) + 1 },
  };
}

export function getActiveTrip(trips) {
  return trips.find((trip) => !trip.endedAt) ?? null;
}

export function getTripDurationMs(trip, now = Date.now()) {
  const start = Date.parse(trip.startedAt);
  const end = trip.endedAt ? Date.parse(trip.endedAt) : now;
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
}

export function formatTripDuration(durationMs) {
  if (durationMs === null) return "Doba neuvedena";
  const totalMinutes = Math.floor(durationMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return days ? `${days} d ${hours} h` : hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function getTripCatchRatePerHour(catchCount, durationMs) {
  if (!Number.isSafeInteger(catchCount) || catchCount < 0 || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  return catchCount * 3_600_000 / durationMs;
}

export function formatTripCatchCount(count) {
  const noun = count === 1 ? "úlovek" : count >= 2 && count <= 4 ? "úlovky" : "úlovků";
  return `${count} ${noun}`;
}

export function getDistinctTripSpecies(catches) {
  const speciesByKey = new Map();
  for (const record of catches) {
    if (record.captureMode === "quick" && !record.speciesKey) continue;
    if (typeof record.species !== "string" || !record.species.trim()) continue;
    const speciesKey = typeof record.speciesKey === "string" && record.speciesKey.trim()
      ? record.speciesKey.trim()
      : record.species.trim().toLocaleLowerCase("cs-CZ");
    if (!speciesByKey.has(speciesKey)) speciesByKey.set(speciesKey, record);
  }
  return [...speciesByKey.values()];
}
