const CACHE_TTL_MS = 10 * 60 * 1000;
const weatherCache = new Map();

function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function targetHour(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !/^\d{2}:\d{2}$/.test(time ?? "")) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = new Date(year, month - 1, day, hour, minute);
  if (target.getFullYear() !== year || target.getMonth() !== month - 1 || target.getDate() !== day || hour > 23 || minute > 59) return null;
  if (minute >= 30) target.setHours(target.getHours() + 1);
  target.setMinutes(0, 0, 0);
  const pad = (value) => String(value).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:00`;
}

function dayDifferenceFromToday(targetDate, now) {
  const [year, month, day] = targetDate.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - target) / 86400000);
}

function createUrl(base, latitude, longitude, date, pastDays) {
  const url = new URL(base);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("hourly", "temperature_2m,surface_pressure,wind_speed_10m");
  url.searchParams.set("timezone", "auto");
  if (pastDays === null) {
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
  } else {
    url.searchParams.set("past_days", String(pastDays));
    url.searchParams.set("forecast_days", "16");
  }
  return url;
}

export async function fetchCatchWeather(latitude, longitude, date, time, { signal, now = new Date() } = {}) {
  if (!validCoordinates(latitude, longitude)) throw new Error("Neplatné souřadnice.");
  const requestedHour = targetHour(date, time);
  if (!requestedHour) throw new Error("Neplatné datum nebo čas úlovku.");
  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)},${requestedHour}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.values;

  const daysAgo = dayDifferenceFromToday(requestedHour.slice(0, 10), now);
  const isWithinForecastHistory = daysAgo >= 0 && daysAgo <= 92;
  const isInForecastRange = daysAgo < 0 && daysAgo >= -15;
  const url = isWithinForecastHistory || isInForecastRange
    ? createUrl("https://api.open-meteo.com/v1/forecast", latitude, longitude, requestedHour.slice(0, 10), Math.max(0, daysAgo))
    : daysAgo > 92
      ? createUrl("https://archive-api.open-meteo.com/v1/archive", latitude, longitude, requestedHour.slice(0, 10), null)
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
