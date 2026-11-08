// Extended optional conditions use the existing bounded Quick Catch envelope,
// never an arbitrary provider response. Core measurements retain their old schema.
export const ENVIRONMENT_FIELDS = Object.freeze({ humidityPct: [0, 100], windDirectionDeg: [0, 360],
  windGustKmh: [0, 400], precipitationMm: [0, 1000], cloudCoverPct: [0, 100], weatherCode: [0, 99],
  pressureChange3hHpa: [-100, 100] });
export const ENVIRONMENT_LABELS = Object.freeze({ humidityPct: ["Vlhkost", "%"], windDirectionDeg: ["Směr větru", "°"],
  windGustKmh: ["Nárazy větru", "km/h"], precipitationMm: ["Srážky za hodinu", "mm"], cloudCoverPct: ["Oblačnost", "%"],
  weatherCode: ["Kód počasí WMO", ""], pressureChange3hHpa: ["Změna tlaku za 3 h", "hPa"] });
const instant = value => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
export function normalizeCatchEnvironment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = { conditions: {} };
  for (const [field, [min, max]] of Object.entries(ENVIRONMENT_FIELDS)) {
    const number = value.conditions?.[field];
    if (typeof number === "number" && Number.isFinite(number) && number >= min && number <= max
      && (field !== "weatherCode" || Number.isInteger(number))) result.conditions[field] = number;
  }
  const weather = value.weather;
  if (weather?.provider === "open-meteo" && ["forecast-model", "historical-reanalysis"].includes(weather.kind)
    && instant(weather.hour) && instant(weather.fetchedAt)) {
    result.weather = { provider: "open-meteo", kind: weather.kind, hour: weather.hour, fetchedAt: weather.fetchedAt };
  }
  const solar = value.astronomy;
  if (solar?.method === "solar-approximation-v1" && instant(solar.forInstant)) {
    result.astronomy = { method: solar.method, forInstant: solar.forInstant };
    for (const field of ["sunriseAt", "sunsetAt"]) if (instant(solar[field])) result.astronomy[field] = solar[field];
    if (["day", "night", "polar-day", "polar-night"].includes(solar.daylight)) result.astronomy.daylight = solar.daylight;
    for (const field of ["minutesFromSunrise", "minutesToSunset"]) {
      if (Number.isFinite(solar[field]) && Math.abs(solar[field]) <= 3000) result.astronomy[field] = Math.round(solar[field]);
    }
    if (Number.isFinite(solar.moonIlluminationPct) && solar.moonIlluminationPct >= 0 && solar.moonIlluminationPct <= 100)
      result.astronomy.moonIlluminationPct = Math.round(solar.moonIlluminationPct);
  }
  return Object.keys(result.conditions).length || result.weather || result.astronomy ? result : null;
}

// Standard solar-transit/hour-angle approximation (apparent horizon -0.833°).
// An approximate recreational calculation, not an observed sunrise or forecast.
export function calculateCatchAstronomy(caughtAt, coordinates) {
  const at = Date.parse(caughtAt), latitude = coordinates?.latitude, longitude = coordinates?.longitude;
  if (!Number.isFinite(at) || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || new Date(at).getUTCFullYear() < 1901 || new Date(at).getUTCFullYear() > 2099) return null;
  const rad = Math.PI / 180, tau = 2 * Math.PI, lw = -longitude * rad, phi = latitude * rad;
  const days = at / 86400000 - 0.5 + 2440588 - 2451545;
  const n = Math.round(days - 0.0009 - lw / tau), transit = 0.0009 + lw / tau + n;
  const mean = rad * (357.5291 + 0.98560028 * transit);
  const ecliptic = mean + rad * (1.9148 * Math.sin(mean) + 0.02 * Math.sin(2 * mean) + 0.0003 * Math.sin(3 * mean)) + rad * 102.9372 + Math.PI;
  const declination = Math.asin(Math.sin(ecliptic) * Math.sin(rad * 23.4397));
  const correction = 0.0053 * Math.sin(mean) - 0.0069 * Math.sin(2 * ecliptic);
  const noon = 2451545 + transit + correction;
  const cosine = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(declination)) / (Math.cos(phi) * Math.cos(declination));
  const age = ((at - Date.UTC(2000, 0, 6, 18, 14)) / 86400000 % 29.530588853 + 29.530588853) % 29.530588853;
  const result = { method: "solar-approximation-v1", forInstant: new Date(at).toISOString(),
    moonIlluminationPct: Math.round((1 - Math.cos(tau * age / 29.530588853)) * 50) };
  if (cosine > 1 || cosine < -1) return { ...result, daylight: cosine > 1 ? "polar-night" : "polar-day" };
  const angle = Math.acos(cosine), set = 2451545 + 0.0009 + (angle + lw) / tau + n + correction;
  const toMs = julian => (julian + 0.5 - 2440588) * 86400000;
  const sunrise = toMs(noon - (set - noon)), sunset = toMs(set);
  return { ...result, sunriseAt: new Date(sunrise).toISOString(), sunsetAt: new Date(sunset).toISOString(),
    daylight: at >= sunrise && at < sunset ? "day" : "night",
    minutesFromSunrise: Math.round((at - sunrise) / 60000), minutesToSunset: Math.round((sunset - at) / 60000) };
}
