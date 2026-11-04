import { analyzeDiary } from "./diaryAnalysis.js";
import { DEFAULT_SPECIES } from "../../shared/constants/speciesCatalog.js";
import { PRODUCT_LIMITS } from "../../product/config/limits.js";

const UNKNOWN = new Set(["unknown", "unspecified", "unidentified"]);
const text = (value) => typeof value === "string" ? value.trim() : "";
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const round = (value) => Number(value.toFixed(1));
const number = (value) => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value);
const noun = (count) => count === 1 ? "úlovek" : count >= 2 && count <= 4 ? "úlovky" : "úlovků";
const catchGenitive = (count) => count === 1 ? "úlovku" : "úlovků";
const recordNoun = (count) => count === 1 ? "záznam" : count >= 2 && count <= 4 ? "záznamy" : "záznamů";
const sameInstant = (value) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day;
};

function collect(records, now) {
  const accepted = [], seen = new Set();
  const quality = { inputCount: records.length, deletedCount: 0, duplicateCount: 0, missingIdCount: 0, invalidDateCount: 0, futureDateCount: 0 };
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) { quality.missingIdCount++; continue; }
    if (record.deleted) { quality.deletedCount++; continue; }
    if (!text(record.id)) { quality.missingIdCount++; continue; }
    if (!sameInstant(record.caughtAt)) { quality.invalidDateCount++; continue; }
    if (Date.parse(record.caughtAt) > now + PRODUCT_LIMITS.futureCatchClockSkewMs) { quality.futureDateCount++; continue; }
    if (seen.has(record.id)) { quality.duplicateCount++; continue; }
    seen.add(record.id);
    const speciesKey = text(record.speciesKey);
    const confirmed = speciesKey && !UNKNOWN.has(speciesKey.toLowerCase()) && record.quickCatch?.provenance?.speciesKey !== "ai_suggestion";
    accepted.push({ ...record, speciesKey: confirmed ? speciesKey : "",
      baits: (Array.isArray(record.baits) ? record.baits : []).filter((bait) => bait && typeof bait === "object" && text(bait.key)),
      lengthCm: positive(record.lengthCm) && record.lengthCm <= PRODUCT_LIMITS.catch.lengthCm ? record.lengthCm : null,
      weightKg: positive(record.weightKg) && record.weightKg <= PRODUCT_LIMITS.catch.weightKg ? record.weightKg : null });
  }
  return { accepted, quality };
}

function groups(records, keyOf, labelOf) {
  const result = new Map();
  for (const record of records) {
    const keys = new Set([keyOf(record)].flat().filter(Boolean));
    for (const key of keys) {
      const entry = result.get(key) ?? { key, label: labelOf(record, key) || key, count: 0, evidenceIds: [] };
      entry.count++; entry.evidenceIds.push(record.id); result.set(key, entry);
    }
  }
  return [...result.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function makeComparison(records, current, period, currentPeriod, timeZone) {
  if (!period) return null;
  const previous = analyzeDiary(records, { timeZone, from: period.from, to: period.to });
  const a = current.providerSummary, b = previous.providerSummary;
  const currentDuration = Date.parse(currentPeriod.to) - Date.parse(currentPeriod.from);
  const previousDuration = Date.parse(period.to) - Date.parse(period.from);
  const sameDuration = Number.isFinite(currentDuration) && currentDuration > 0 && currentDuration === previousDuration;
  const overlap = Number.isFinite(currentDuration) && Date.parse(currentPeriod.from) < Date.parse(period.to)
    && Date.parse(period.from) < Date.parse(currentPeriod.to);
  const comparable = sameDuration && !overlap;
  const percent = comparable && b.count > 0 ? round((a.count - b.count) / b.count * 100) : null;
  const lengthComparable = comparable && a.measuredLengthCount >= PRODUCT_LIMITS.statsPatternMinimumSample
    && b.measuredLengthCount >= PRODUCT_LIMITS.statsPatternMinimumSample;
  return { currentCount: a.count, previousCount: b.count, changeCount: a.count - b.count, changePercent: percent,
    comparable, sameDuration, overlapping: overlap, previousPeriod: { from: period.from ?? null, to: period.to ?? null },
    currentEvidenceIds: current.evidenceIds, previousEvidenceIds: previous.evidenceIds,
    meanLengthChangeCm: lengthComparable ? round(a.meanLengthCm - b.meanLengthCm) : null,
    text: `Ve vybraném období máš ${a.count} ${noun(a.count)}, ve srovnávaném ${b.count} ${noun(b.count)}.`
      + (percent !== null ? ` Počet záznamů se změnil o ${number(percent)} %.` : " Procentuální změna se nezobrazuje: chybí srovnatelná nepřekrývající se období nebo předchozí záznamy."),
    limitation: "Srovnání počtů nebere v úvahu čas strávený lovem. Průměrná délka může zahrnovat různé druhy ryb." };
}

/** A local, deterministic explanation of actual diary data. No model, requests, predictions, or record mutations. */
export function buildDiaryInsights(records = [], { trips = [], waters = [], timeZone = "Europe/Prague", from = null, to = null,
  comparison = null, now = new Date(), speciesCatalog = DEFAULT_SPECIES } = {}) {
  const source = Array.isArray(records) ? records : [];
  const nowMs = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError("Neplatný čas přehledu.");
  const { accepted, quality } = collect(source, nowMs);
  const analysis = analyzeDiary(accepted, { timeZone, from, to });
  const included = new Set(analysis.evidenceIds);
  const selected = accepted.filter((record) => included.has(record.id));
  const stats = analysis.providerSummary;
  const count = stats.count;
  const speciesById = new Map((Array.isArray(speciesCatalog) ? speciesCatalog : DEFAULT_SPECIES).filter(Boolean).map((species) => [species.key, species.label]));
  const watersById = new Map((Array.isArray(waters) ? waters : []).filter(Boolean).map((water) => [water.id, water]));
  const tripsById = new Map((Array.isArray(trips) ? trips : []).filter((trip) => trip && !trip.deleted).map((trip) => [trip.id, trip]));
  const species = groups(selected, (record) => record.speciesKey, (record, key) => speciesById.get(key) || text(record.species) || "Vlastní druh");
  const methods = groups(selected, (record) => text(record.method?.key), (record) => text(record.method?.label));
  const baits = groups(selected, (record) => (Array.isArray(record.baits) ? record.baits : []).map((bait) => text(bait?.key)),
    (record, key) => text(record.baits.find((bait) => bait?.key === key)?.label));
  const waterFor = (record) => {
    const water = watersById.get(record.waterId);
    const label = text(water?.name) || text(record.locationName) || text(tripsById.get(record.tripId)?.locationName);
    return label ? { key: record.waterId ? `water:${record.waterId}` : `name:${label}`, label } : null;
  };
  const waterGroups = groups(selected, (record) => waterFor(record)?.key, (record) => waterFor(record)?.label);
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" });
  const hours = groups(selected, (record) => formatter.format(new Date(record.caughtAt)), (record, key) => `${key}:00–${String((Number(key) + 1) % 24).padStart(2, "0")}:00`);
  const facts = [{ id: "catch-count", title: "Zapsané úlovky", text: `${count} ${noun(count)} ve vybraném období.`, value: count, sampleSize: count, evidenceIds: analysis.evidenceIds }];
  const insights = [], recommendations = [];
  const addLeading = (id, title, entries, prefix) => {
    if (!entries.length) return;
    const leading = entries.filter((entry) => entry.count === entries[0].count);
    facts.push({ id, title, text: `${prefix}: ${leading.slice(0, 3).map((entry) => entry.label).join(", ")}${leading.length > 3 ? ` a další ${leading.length - 3}` : ""} (${leading[0].count} ${recordNoun(leading[0].count)} na položku).`,
      value: leading, sampleSize: new Set(entries.flatMap((entry) => entry.evidenceIds)).size, evidenceIds: [...new Set(leading.flatMap((entry) => entry.evidenceIds))] });
  };
  addLeading("species", "Nejčastěji zapsaný druh", species, "Nejvíce záznamů má");
  addLeading("waters", "Zapsané vody a místa", waterGroups, "Nejvíce úlovků je zapsáno u");
  addLeading("methods", "Zapsané metody", methods, "Nejčastěji zapsaná metoda");
  addLeading("baits", "Zapsané nástrahy", baits, "Nejčastěji zapsaná nástraha");
  addLeading("hours", "Čas záznamů", hours, `Nejvíce úlovků má čas v pásmu ${timeZone}`);
  const measured = selected.filter((record) => positive(record.lengthCm));
  if (measured.length) facts.push({ id: "length", title: "Zapsané délky", value: { meanCm: round(stats.meanLengthCm), longestCm: stats.longestCm },
    text: `Průměr zadaných délek je ${number(stats.meanLengthCm)} cm, nejdelší záznam má ${number(stats.longestCm)} cm. Míru má ${measured.length} z ${count} úlovků.`,
    sampleSize: measured.length, evidenceIds: measured.map((record) => record.id) });
  const weather = {};
  for (const [field, label, unit, min, max] of [["airTempC", "Teplota vzduchu", "°C", -60, 60], ["pressureHpa", "Tlak", "hPa", 300, 1200], ["windKmh", "Vítr", "km/h", 0, 300]]) {
    const available = selected.filter((record) => Number.isFinite(record.conditions?.[field]) && record.conditions[field] >= min && record.conditions[field] <= max);
    if (!available.length) continue;
    const values = available.map((record) => record.conditions[field]);
    weather[field] = { count: values.length, mean: round(values.reduce((sum, value) => sum + value, 0) / values.length), min: values.reduce((min, value) => Math.min(min, value)), max: values.reduce((max, value) => Math.max(max, value)),
      evidenceIds: available.map((record) => record.id), sourceCounts: {
        manual: available.filter((record) => record.conditionSources?.[field] === "manual").length,
        automatic: available.filter((record) => record.conditionSources?.[field] === "auto").length,
        unspecified: available.filter((record) => !["manual", "auto"].includes(record.conditionSources?.[field])).length } };
    if (available.length >= PRODUCT_LIMITS.statsPatternMinimumSample) insights.push({ id: `weather-${field}`, title: label,
      text: `U ${available.length} záznamů je ${label.toLocaleLowerCase("cs-CZ")} ${number(weather[field].min)} až ${number(weather[field].max)} ${unit}. Jde o zaznamenané podmínky, nikoli důkaz jejich vlivu na úlovek.`,
      value: weather[field], sampleSize: available.length, evidenceIds: weather[field].evidenceIds });
  }
  const knownTripIds = [...new Set(selected.map((record) => record.tripId).filter((id) => tripsById.has(id)))];
  if (knownTripIds.length) facts.push({ id: "trips", title: "Vazba na výpravy", text: `Počet vycházek propojených s úlovky: ${knownTripIds.length}. Počty úlovků nevyjadřují úspěšnost výpravy.`,
    value: knownTripIds.length, sampleSize: selected.filter((record) => knownTripIds.includes(record.tripId)).length,
    evidenceIds: selected.filter((record) => knownTripIds.includes(record.tripId)).map((record) => record.id) });
  const missingSpeciesIds = selected.filter((record) => !record.speciesKey).map((record) => record.id);
  const missingLengthIds = selected.filter((record) => !positive(record.lengthCm)).map((record) => record.id);
  const missingWaterIds = selected.filter((record) => !waterFor(record)).map((record) => record.id);
  const dataQuality = { ...quality, includedCount: count, outsidePeriodCount: accepted.length - count, smallSample: count < 10,
    missingSpecies: missingSpeciesIds.length, missingLength: missingLengthIds.length, missingMeasuredWeight: stats.missing.measuredWeight,
    missingWater: missingWaterIds.length, measuredLengthCount: measured.length, weather, confirmedSpeciesCount: count - missingSpeciesIds.length };
  if (!count) recommendations.push({ id: "start", kind: "data_quality", title: "Začni vlastním záznamem", text: "Vyfoť úlovek přes Rychlý úlovek. Druh a délku můžeš doplnit později; bez záznamů osobní vzorce neurčujeme.", evidenceIds: [] });
  if (count > 0 && count < 10) recommendations.push({ id: "build-sample", kind: "observation", title: "Nech deník postupně růst", text: "Pokračuj v zapisování různých vycházek, včetně těch bez úlovku. Z několika ryb zatím nelze určit nejlepší vodu, čas ani nástrahu.", evidenceIds: analysis.evidenceIds });
  if (missingSpeciesIds.length) recommendations.push({ id: "complete-species", kind: "data_quality", title: "Doplň druh, když ho znáš", text: `U ${missingSpeciesIds.length} ${catchGenitive(missingSpeciesIds.length)} chybí potvrzený druh. Nevyřešený návrh rozpoznání se nepočítá jako určená ryba.`, evidenceIds: missingSpeciesIds });
  if (missingLengthIds.length) recommendations.push({ id: "complete-length", kind: "data_quality", title: "Pro porovnávání pomůže délka", text: `U ${missingLengthIds.length} ${catchGenitive(missingLengthIds.length)} není délka. Pokud ji máš změřenou, doplň centimetry; z fotografie ji neodhadujeme. Hmotnost zůstává volitelná.`, evidenceIds: missingLengthIds });
  if (missingWaterIds.length) recommendations.push({ id: "complete-water", kind: "data_quality", title: "Místo doplň pouze, pokud ho znáš", text: `U ${missingWaterIds.length} ${catchGenitive(missingWaterIds.length)} chybí voda nebo místo. Bez spolehlivého údaje se nejbližší voda nepovažuje za místo úlovku.`, evidenceIds: missingWaterIds });
  if (hours[0]?.count >= PRODUCT_LIMITS.statsPatternMinimumSample) recommendations.push({ id: "observe-hours", kind: "observation", title: "Ověř vlastní časový vzorec", text: `V čase ${hours[0].label} máš ${hours[0].count} ${recordNoun(hours[0].count)}. Při dalších vycházkách porovnej i jiné časy a zapisuj také vycházky bez úlovku. Četnost záznamů sama neříká, kdy ryby berou nejlépe.`, evidenceIds: hours[0].evidenceIds });
  if (methods[0]?.count >= PRODUCT_LIMITS.statsPatternMinimumSample) recommendations.push({ id: "observe-method", kind: "observation", title: "Porovnávej podobné vycházky", text: `Metoda ${methods[0].label} je u ${methods[0].count} záznamů. Pro vlastní srovnání zapisuj i dobu lovu a vycházky bez ryby; častěji používaná metoda nemusí být účinnější.`, evidenceIds: methods[0].evidenceIds });
  const limitations = ["Přehled se počítá přímo z tvých záznamů v tomto zařízení. Nejde o generované AI tvrzení ani předpověď úlovku.",
    "Četnosti popisují zapsané úlovky. Bez úplného času a počtu všech vycházek nevyjadřují pravděpodobnost, účinnost ani příčinu úspěchu.",
    ...(count < 10 ? ["Zatím máš malý vzorek. Jednotlivé úlovky slouží k popisu, nikoli ke spolehlivému zobecnění."] : []),
    ...(Object.keys(weather).length ? ["Počasí může být ručně zapsané nebo převzaté z modelu. Chybí srovnání s podmínkami bez úlovků."] : [])];
  const summary = !count ? "Ve vybraném období zatím nejsou platné záznamy úlovků."
    : `Ve vybraném období máš ${count} ${noun(count)}. ${measured.length ? `Délka je zaznamenána u ${measured.length} z nich.` : "Délky zatím nejsou zaznamenané."}`
      + (count < 10 ? " Vzorek je zatím malý; výsledky ber jako popis deníku." : " Záznamy ukazují četnosti, nikoli zaručený úspěch při lovu.");
  return { mode: "deterministic", summary, facts, insights, recommendations, dataQuality, limitations,
    comparison: makeComparison(accepted, analysis, comparison, { from, to }, timeZone), evidenceIds: analysis.evidenceIds,
    period: { from, to, timeZone }, distributions: { species, waters: waterGroups, methods, baits, hours }, statistics: stats };
}
