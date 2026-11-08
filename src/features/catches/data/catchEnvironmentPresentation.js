import { normalizeCatchEnvironment, ENVIRONMENT_LABELS } from "./catchEnvironment.js";
import { MOON_PHASE_EMOJI } from "../../../shared/constants/moonPhaseEmoji.js";
const number = value => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value);
const known = value => typeof value === "number" && Number.isFinite(value);
const wmo = code => code === 0 ? "Jasno" : [1, 2].includes(code) ? "Polojasno" : code === 3 ? "Zataženo"
  : [45, 48].includes(code) ? "Mlha" : [51, 53, 55, 56, 57].includes(code) ? "Mrholení"
    : [61, 63, 65, 66, 67].includes(code) ? "Déšť" : [71, 73, 75, 77].includes(code) ? "Sněžení"
      : [80, 81, 82].includes(code) ? "Dešťové přeháňky" : [85, 86].includes(code) ? "Sněhové přeháňky"
        : [95, 96, 99].includes(code) ? "Bouřka" : `Kód WMO ${code}`;
export function buildCatchEnvironmentPresentation(record, { online = true } = {}) {
  const conditions = record.conditions ?? {}, environment = normalizeCatchEnvironment(record.quickCatch?.environment);
  const weather = [], water = [], astronomy = [];
  const source = field => record.conditionSources?.[field] === "auto" ? " · model počasí" : "";
  for (const [field, label, unit] of [["airTempC", "Vzduch", "°C"], ["pressureHpa", "Tlak při povrchu", "hPa"], ["windKmh", "Vítr", "km/h"]]) {
    const value = conditions[field] ?? conditions[field === "airTempC" ? "airTemperatureC" : field];
    if (known(value)) weather.push([label, `${number(value)} ${unit}${source(field)}`]);
  }
  for (const [field, value] of Object.entries(environment?.conditions ?? {})) {
    const [label, unit] = ENVIRONMENT_LABELS[field];
    const automatic = record.quickCatch?.provenance?.[field] === "weather_api" ? " · model počasí" : "";
    weather.push([label, `${field === "weatherCode" ? wmo(value) : `${number(value)}${unit ? ` ${unit}` : ""}`}${automatic}`]);
  }
  if (typeof conditions.weather === "string" && conditions.weather.trim()) weather.push(["Počasí", conditions.weather]);
  if (typeof conditions.windDirection === "string" && conditions.windDirection.trim()) weather.push(["Směr větru", conditions.windDirection]);
  if (typeof conditions.pressureTrend === "string" && conditions.pressureTrend.trim()) weather.push(["Trend tlaku", conditions.pressureTrend]);
  if (known(conditions.waterTempC ?? conditions.waterTemperatureC)) water.push(["Teplota vody", `${number(conditions.waterTempC ?? conditions.waterTemperatureC)} °C`]);
  if (known(record.waterDepthM)) water.push(["Hloubka", `${number(record.waterDepthM)} m`]);
  if (record.bottomType) water.push(["Dno", record.bottomType]);
  if (conditions.moonPhase) astronomy.push(["Fáze měsíce", MOON_PHASE_EMOJI[conditions.moonPhase] ?? conditions.moonPhase]);
  const solar = environment?.astronomy;
  if (solar && solar.forInstant === record.caughtAt) {
    const time = value => `${new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value))} UTC · přibližný výpočet`;
    if (solar.sunriseAt) astronomy.push(["Východ slunce", time(solar.sunriseAt)]);
    if (solar.sunsetAt) astronomy.push(["Západ slunce", time(solar.sunsetAt)]);
    if (solar.daylight) astronomy.push(["Světlo při úlovku", { day: "Den", night: "Noc", "polar-day": "Polární den", "polar-night": "Polární noc" }[solar.daylight]]);
    if (known(solar.moonIlluminationPct)) astronomy.push(["Osvětlení Měsíce", `přibližně ${solar.moonIlluminationPct} %`]);
    if (known(solar.minutesFromSunrise)) astronomy.push(["Vůči východu slunce", `${Math.abs(solar.minutesFromSunrise)} min ${solar.minutesFromSunrise >= 0 ? "po" : "před"} východem`]);
    if (known(solar.minutesToSunset)) astronomy.push(["Vůči západu slunce", `${Math.abs(solar.minutesToSunset)} min ${solar.minutesToSunset >= 0 ? "před" : "po"} západem`]);
  }
  const job = record.quickCatch?.enrichment?.weather;
  const status = !job ? null : job.status === "pending" ? online ? "Počasí se doplňuje samostatně." : "Počasí čeká na připojení."
    : job.status === "failed" ? "Počasí se nepodařilo doplnit. Úlovek je bezpečně uložený."
      : job.status === "unavailable" ? "Pro počasí nejsou dostupné potřebné podklady, například ověřená poloha."
        : "Dostupné údaje o počasí byly doplněny.";
  return { weather, water, astronomy, status, weatherSource: environment?.weather ?? null };
}
