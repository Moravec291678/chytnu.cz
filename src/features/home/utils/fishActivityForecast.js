import { calculateFishActivity } from "./fishActivity.js";

export function getFishActivityForecast(data) {
  const currentTime = data?.current?.time;
  const times = data?.hourly?.time;
  const fields = {
    temperature: data?.hourly?.temperature_2m,
    windSpeed: data?.hourly?.wind_speed_10m,
    pressure: data?.hourly?.surface_pressure,
    cloudiness: data?.hourly?.cloud_cover,
    rainChance: data?.hourly?.precipitation_probability,
  };
  const startTimestamp = Date.parse(currentTime);
  if (typeof currentTime !== "string" || !Number.isFinite(startTimestamp) || !Array.isArray(times)) return [];
  if (Object.values(fields).some((values) => !Array.isArray(values) || values.length !== times.length)) return [];

  const startIndex = times.findIndex((time) => typeof time === "string" && Date.parse(time) >= startTimestamp);
  if (startIndex < 0) return [];

  const forecast = [];
  for (let offsetHours = 0; offsetHours < 48; offsetHours += 6) {
    const index = startIndex + offsetHours;
    const time = times[index];
    if (typeof time !== "string" || !Number.isFinite(Date.parse(time))) break;
    const values = Object.fromEntries(Object.entries(fields).map(([key, list]) => [key, list[index]]));
    if (Object.values(values).some((value) => !Number.isFinite(value))) continue;

    const activity = calculateFishActivity(values, new Date(time));
    forecast.push({ time, label: time.slice(11, 16), score: activity.score });
  }

  return forecast;
}
