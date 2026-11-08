const CACHE_TTL_MS = 10 * 60 * 1000;
const weatherCache = new Map();
import { ENVIRONMENT_FIELDS } from "../../features/catches/data/catchEnvironment.js";

function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function targetHour(date, time, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !/^\d{2}:\d{2}$/.test(time ?? "")) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utc = timezone === "UTC";
  const target = utc ? new Date(Date.UTC(year, month - 1, day, hour, minute)) : new Date(year, month - 1, day, hour, minute);
  const get = (part) => target[`get${utc ? "UTC" : ""}${part}`]();
  if (get("FullYear") !== year || get("Month") !== month - 1 || get("Date") !== day || hour > 23 || minute > 59) return null;
  if (utc) {
    if (minute >= 30) target.setUTCHours(target.getUTCHours() + 1);
    target.setUTCMinutes(0, 0, 0);
  } else {
    if (minute >= 30) target.setHours(target.getHours() + 1);
    target.setMinutes(0, 0, 0);
  }
  const pad = (value) => String(value).padStart(2, "0");
  return `${get("FullYear")}-${pad(get("Month") + 1)}-${pad(get("Date"))}T${pad(get("Hours"))}:00`;
}

function dayDifferenceFromToday(targetDate, now, timezone) {
  const [year, month, day] = targetDate.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  const today = timezone === "UTC" ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    : Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - target) / 86400000);
}

function createUrl(base, latitude, longitude, date, pastDays, timezone, includeDetails) {
  const url = new URL(base);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("hourly", "temperature_2m,surface_pressure,wind_speed_10m"
    + (includeDetails ? ",relative_humidity_2m,wind_direction_10m,wind_gusts_10m,precipitation,cloud_cover,weather_code" : ""));
  url.searchParams.set("timezone", timezone);
  // Request only the catch day. The old past_days+16-day forecast request could
  // download months of unrelated hours for a single catch.
  void pastDays;
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  return url;
}

export async function fetchCatchWeather(latitude, longitude, date, time, { signal, now = new Date(), timezone = "auto", includeDetails = false } = {}) {
  if (!validCoordinates(latitude, longitude)) throw new Error("Neplatné souřadnice.");
  if (!["auto", "UTC"].includes(timezone)) throw new Error("Neplatné časové pásmo počasí.");
  const requestedHour = targetHour(date, time, timezone);
  if (!requestedHour) throw new Error("Neplatné datum nebo čas úlovku.");
  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)},${requestedHour},${timezone},${includeDetails}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.values;

  const daysAgo = dayDifferenceFromToday(requestedHour.slice(0, 10), now, timezone);
  const isWithinForecastHistory = daysAgo >= 0 && daysAgo <= 92;
  const isInForecastRange = daysAgo < 0 && daysAgo >= -15;
  const url = isWithinForecastHistory || isInForecastRange
    ? createUrl("https://api.open-meteo.com/v1/forecast", latitude, longitude, requestedHour.slice(0, 10), Math.max(0, daysAgo), timezone, includeDetails)
    : daysAgo > 92
      ? createUrl("https://archive-api.open-meteo.com/v1/archive", latitude, longitude, requestedHour.slice(0, 10), null, timezone, includeDetails)
      : null;
  if (!url) throw new Error("Počasí pro tento budoucí termín zatím není dostupné.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Počasí pro místo a čas úlovku není dostupné.");
    const data = await response.json();
    const index = data?.hourly?.time?.findIndex((value) => value === requestedHour) ?? -1;
    const hourly = data?.hourly;
    const airTempC = hourly?.temperature_2m?.[index];
    const pressureHpa = hourly?.surface_pressure?.[index];
    const windKmh = hourly?.wind_speed_10m?.[index];
    if (index < 0) throw new Error("Počasí pro zadanou hodinu není dostupné.");
    const values = {};
    if (Number.isFinite(airTempC)) values.airTempC = airTempC;
    if (Number.isFinite(pressureHpa)) values.pressureHpa = pressureHpa;
    if (Number.isFinite(windKmh)) values.windKmh = windKmh;
    if (!Object.keys(values).length) throw new Error("Zdroj nevrátil dostupné hodnoty počasí.");
    if (includeDetails) {
      const mapping = { humidityPct: "relative_humidity_2m", windDirectionDeg: "wind_direction_10m", windGustKmh: "wind_gusts_10m",
        precipitationMm: "precipitation", cloudCoverPct: "cloud_cover", weatherCode: "weather_code" };
      const conditions = {};
      for (const [field, source] of Object.entries(mapping)) {
        const value = hourly?.[source]?.[index], [min, max] = ENVIRONMENT_FIELDS[field];
        if (Number.isFinite(value) && value >= min && value <= max && (field !== "weatherCode" || Number.isInteger(value))) conditions[field] = value;
      }
      const pastHour = hourly?.time?.[index - 3];
      // Only contiguous absolute UTC hours establish a three-hour pressure change.
      if (timezone === "UTC" && pastHour && Date.parse(`${requestedHour}Z`) - Date.parse(`${pastHour}Z`) === 10800000
        && Number.isFinite(hourly.surface_pressure?.[index - 3]) && Number.isFinite(pressureHpa)) {
        const difference = pressureHpa - hourly.surface_pressure[index - 3];
        if (Math.abs(difference) <= 100) conditions.pressureChange3hHpa = Math.round(difference * 10) / 10;
      }
      values.environment = { conditions, weather: { provider: "open-meteo", kind: daysAgo > 92 ? "historical-reanalysis" : "forecast-model",
        hour: `${requestedHour}${timezone === "UTC" ? ":00.000Z" : ":00"}`, fetchedAt: now.toISOString() } };
    }
    if (weatherCache.size >= 100) weatherCache.delete(weatherCache.keys().next().value);
    weatherCache.set(cacheKey, { values, fetchedAt: Date.now() });
    return values;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error("Načítání počasí trvalo příliš dlouho.", { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function clearCatchWeatherCache() {
  weatherCache.clear();
}

export function replaceAutomaticConditions(current, previousAutomatic, nextAutomatic, manualFields = new Set()) {
  const next = { ...(current ?? {}) };
  for (const [field, value] of Object.entries(previousAutomatic ?? {})) {
    if (!manualFields.has(field) && next[field] === value) next[field] = "";
  }
  for (const [field, value] of Object.entries(nextAutomatic ?? {})) {
    if (!manualFields.has(field) && (next[field] === "" || next[field] === null || next[field] === undefined)) next[field] = value;
  }
  return next;
}
