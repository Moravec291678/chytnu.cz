const CACHE_TTL_MS = 5 * 60 * 1000;
let weatherCache = null;

export function clearWeatherCache() {
  weatherCache = null;
}

export async function fetchWeatherData(lat, lng, { signal, now } = {}) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw Object.assign(new Error("Zjištěná poloha není platná."), { kind: "location-unavailable" });
  }

  const requestTime = now ?? Date.now();
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (weatherCache?.key === cacheKey && requestTime - weatherCache.fetchedAt < CACHE_TTL_MS) {
    return { data: weatherCache.data, fetchedAt: weatherCache.fetchedAt, cached: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  const abortRequest = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortRequest, { once: true });

  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover&hourly=precipitation_probability&daily=sunrise,sunset&timezone=auto`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw Object.assign(new Error("Počasí se nepodařilo načíst."), { kind: "weather-unavailable" });
    }

    const data = await response.json();
    getWeatherConditions(data);
    const fetchedAt = now ?? Date.now();
    weatherCache = { key: cacheKey, data, fetchedAt };
    return { data, fetchedAt, cached: false };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw Object.assign(new Error("Načítání počasí trvalo příliš dlouho."), { kind: "weather-unavailable" });
    }
    if (error.kind) throw error;
    throw Object.assign(new Error("Počasí teď není dostupné. Zkontroluj připojení a zkus to znovu."), { kind: "weather-unavailable" });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortRequest);
  }
}

export function getWeatherConditions(data) {
  const currentTime = data?.current?.time;
  const hourlyTimes = data?.hourly?.time;
  const rainProbabilities = data?.hourly?.precipitation_probability;
  const sunrise = data?.daily?.sunrise?.[0];
  const sunset = data?.daily?.sunset?.[0];
  const timezone = data?.timezone;
  const timezoneAbbreviation = data?.timezone_abbreviation;

  if (typeof currentTime !== "string" || typeof timezone !== "string" || !Array.isArray(hourlyTimes) || !Array.isArray(rainProbabilities) || typeof sunrise !== "string" || typeof sunset !== "string") {
    throw Object.assign(new Error("Počasí vrátilo neúplné údaje."), { kind: "weather-unavailable" });
  }

  const hourPrefix = currentTime.slice(0, 13);
  const hourIndex = hourlyTimes.findIndex((time) => typeof time === "string" && time.startsWith(hourPrefix));
  const values = {
    temperature: data.current.temperature_2m,
    windSpeed: data.current.wind_speed_10m,
    pressure: data.current.surface_pressure,
    cloudiness: data.current.cloud_cover,
    rainChance: rainProbabilities[hourIndex],
  };

  const validRanges = {
    temperature: [-100, 70],
    windSpeed: [0, 500],
    pressure: [700, 1200],
    cloudiness: [0, 100],
    rainChance: [0, 100],
  };
  if (hourIndex < 0 || Object.entries(values).some(([key, value]) => {
    const range = validRanges[key];
    return !Number.isFinite(value) || value < range[0] || value > range[1];
  })) {
    throw Object.assign(new Error("Počasí vrátilo neúplné údaje."), { kind: "weather-unavailable" });
  }

  return { ...values, sunrise, sunset, currentTime, timezone, timezoneAbbreviation };
}
