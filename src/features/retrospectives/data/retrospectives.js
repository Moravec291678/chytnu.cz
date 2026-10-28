import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { getPragueDateParts } from "../../stats/utils/statsPeriod.js";
import { normalizeText } from "../../../shared/utils/helpers.js";

function ranking(records, getKey, getLabel) {
  const counts = new Map();
  for (const record of records) {
    const key = getKey(record);
    if (!key) continue;
    const current = counts.get(key) || { key, label: getLabel(record) || key, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "cs-CZ"));
}

function validDate(record) { const time = Date.parse(record.caughtAt); return Number.isFinite(time) ? new Date(time) : null; }
function validTripDate(trip) {
  const started = Date.parse(trip?.startedAt);
  const time = Number.isFinite(started) ? started : Date.parse(trip?.createdAt);
  return Number.isFinite(time) ? new Date(time) : null;
}
function topOrNull(records, key, label) { return ranking(records, key, label)[0] || null; }

export function getBestCatchMonth(records = []) {
  const dated = records.filter((record) => validDate(record));
  return topOrNull(
    dated,
    (record) => String(getPragueDateParts(validDate(record)).month),
    (record) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", month: "long" }).format(validDate(record)),
  );
}

const UNKNOWN_BAIT_VALUES = new Set(["unknown", "unset", "none", "no bait", "neznama", "nezname", "neuvedeno", "nezadano", "zadna", "bez nastrahy"]);

export function getBestCatchBait(records = []) {
  const occurrences = [];
  for (const record of records) {
    const seen = new Set();
    for (const bait of Array.isArray(record?.baits) ? record.baits : []) {
      const label = typeof bait?.label === "string" ? bait.label.trim() : "";
      const identity = typeof bait?.key === "string" && bait.key.trim() ? bait.key.trim() : normalizeText(label);
      if (!label || !identity || UNKNOWN_BAIT_VALUES.has(normalizeText(identity)) || UNKNOWN_BAIT_VALUES.has(normalizeText(label))) continue;
      const normalizedIdentity = normalizeText(identity);
      if (seen.has(normalizedIdentity)) continue;
      seen.add(normalizedIdentity);
      occurrences.push({ key: normalizedIdentity, label });
    }
  }
  return topOrNull(occurrences, (bait) => bait.key, (bait) => bait.label);
}

export function getAvailableSummaryYears(catches = [], trips = [], currentYear = getPragueDateParts(new Date()).year) {
  const years = new Set([currentYear]);
  for (const record of catches) {
    const date = validDate(record);
    if (date) years.add(getPragueDateParts(date).year);
  }
  for (const trip of trips) {
    const date = validTripDate(trip);
    if (date) years.add(getPragueDateParts(date).year);
  }
  return [...years].sort((left, right) => right - left);
}

export function buildInsights(catches) {
  const dated = catches.map((record) => ({ record, date: validDate(record) })).filter((item) => item.date);
  const species = topOrNull(catches, (r) => r.speciesKey || r.speciesId, (r) => r.species);
  const method = topOrNull(catches, (r) => r.method?.key, (r) => r.method?.label);
  const bait = getBestCatchBait(catches);
  const hours = ranking(dated, ({ date }) => String(getPragueDateParts(date).hour), ({ date }) => `${String(getPragueDateParts(date).hour).padStart(2, "0")}:00`);
  const bestMonth = getBestCatchMonth(dated.map(({ record }) => record));
  const enough = (item) => item && item.count >= 3;
  return [
    { key: "time", label: "Nejčastější čas", value: enough(hours[0]) ? hours[0].label : null, count: enough(hours[0]) ? hours[0].count : 0 },
    { key: "method", label: "Nejčastější metoda", value: enough(method) ? method.label : null, count: enough(method) ? method.count : 0 },
    { key: "bait", label: "Nejčastější nástraha", value: enough(bait) ? bait.label : null, count: enough(bait) ? bait.count : 0 },
    { key: "month", label: "Nejproduktivnější měsíc", value: enough(bestMonth) ? bestMonth.label : null, count: enough(bestMonth) ? bestMonth.count : 0 },
    { key: "species", label: "Nejčastější druh", value: enough(species) ? species.label : null, count: enough(species) ? species.count : 0 },
  ];
}

export function buildYearSummary(catches, trips, year) {
  const inYear = (value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && getPragueDateParts(new Date(time)).year === year;
  };
  const records = catches.filter((record) => inYear(record.caughtAt));
  const datedTrips = trips.filter((trip) => {
    const date = validTripDate(trip);
    return date && getPragueDateParts(date).year === year;
  });
  const measuredWeight = records.filter(isMeasuredCatchWeight).sort((a, b) => b.weightKg - a.weightKg);
  const recordedWeight = records.filter((record) => Number.isFinite(record.weightKg) && record.weightKg >= 0)
    .sort((a, b) => b.weightKg - a.weightKg || String(a.id || "").localeCompare(String(b.id || "")));
  const measuredLength = records.filter((record) => Number.isFinite(record.lengthCm)).sort((a, b) => b.lengthCm - a.lengthCm);
  const uniqueSpecies = new Set(records.map((r) => r.speciesKey || r.species).filter(Boolean));
  return { year, catches: records.length, trips: datedTrips.length, species: uniqueSpecies.size,
    biggest: measuredWeight[0] || null, largestRecordedCatch: recordedWeight[0] || null, longest: measuredLength[0] || null,
    bestMonth: getBestCatchMonth(records), bestMethod: topOrNull(records, (r) => r.method?.key, (r) => r.method?.label),
    bestBait: getBestCatchBait(records),
    recordsWithWeight: measuredWeight.length, recordsWithLength: measuredLength.length };
}

export function buildSeasonStory(catches, trips, seasonYear) {
  return buildSeasonStoryWithWaters(catches, trips, [], seasonYear);
}

function tripDate(trip) {
  const time = Date.parse(trip?.startedAt || trip?.createdAt);
  return Number.isFinite(time) ? new Date(time) : null;
}

function tripDistanceKm(trip) {
  if (Number.isFinite(trip?.distanceKm) && trip.distanceKm >= 0) return trip.distanceKm;
  if (Number.isFinite(trip?.distanceMeters) && trip.distanceMeters >= 0) return trip.distanceMeters / 1000;
  return null;
}

function compareCatchIdentity(left, right) {
  const leftTime = validDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTime = validDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime || String(left.id || "").localeCompare(String(right.id || ""));
}

function selectBestMoment(records) {
  const weighted = records.filter(isMeasuredCatchWeight).sort((left, right) => right.weightKg - left.weightKg || compareCatchIdentity(left, right));
  if (weighted[0]) return { kind: "weight-pb", label: "Nejtěžší měřený úlovek", record: weighted[0] };
  const longest = records.filter((record) => Number.isFinite(record.lengthCm)).sort((left, right) => right.lengthCm - left.lengthCm || compareCatchIdentity(left, right));
  if (longest[0]) return { kind: "length-pb", label: "Nejdelší měřený úlovek", record: longest[0] };
  const first = [...records].sort(compareCatchIdentity)[0];
  return first ? { kind: "first-catch", label: "První zapsaný úlovek roku", record: first } : null;
}

function favoriteWaterFor(records, seasonTrips, waters) {
  const waterById = new Map((waters || []).filter((water) => water?.id).map((water) => [water.id, water]));
  const activity = new Map();
  const add = (waterId, field) => {
    if (!waterById.has(waterId)) return;
    const current = activity.get(waterId) || { id: waterId, name: waterById.get(waterId).name, catchCount: 0, tripCount: 0 };
    current[field] += 1;
    activity.set(waterId, current);
  };
  records.forEach((record) => add(record.waterId, "catchCount"));
  seasonTrips.forEach((trip) => add(trip.waterId, "tripCount"));
  return [...activity.values()].sort((left, right) =>
    (right.catchCount + right.tripCount) - (left.catchCount + left.tripCount)
    || right.catchCount - left.catchCount
    || left.name.localeCompare(right.name, "cs-CZ")
    || left.id.localeCompare(right.id))[0] || null;
}

function bestBaitFor(records) {
  return getBestCatchBait(records);
}

function catchNoun(count) {
  return count === 1 ? "úlovek" : count >= 2 && count <= 4 ? "úlovky" : "úlovků";
}

export function buildSeasonStoryWithWaters(catches = [], trips = [], waters = [], seasonYear = new Date().getFullYear()) {
  const records = catches.filter((record) => validDate(record)?.getFullYear() === seasonYear);
  const seasonTrips = trips.filter((trip) => tripDate(trip)?.getFullYear() === seasonYear);
  const speciesCount = new Set(records.map((record) => record.speciesKey || record.species).filter(Boolean)).size;
  const bestMonth = getBestCatchMonth(records);
  const recordedDistances = seasonTrips.map(tripDistanceKm).filter((value) => value !== null);
  const distanceKm = recordedDistances.length
    ? Math.round(recordedDistances.reduce((sum, value) => sum + value, 0) * 10) / 10
    : null;
  const favoriteWater = favoriteWaterFor(records, seasonTrips, waters);
  const bestBait = bestBaitFor(records);
  const bestMoment = selectBestMoment(records);
  const narrative = records.length
    ? `V roce ${seasonYear} sis zapsal/a ${records.length} ${catchNoun(records.length)} napříč ${speciesCount} ${speciesCount === 1 ? "druhem" : "druhy"}.`
    : `Pro rok ${seasonYear} zatím nejsou žádné zapsané úlovky.`;
  return {
    year: seasonYear,
    catches: records.length,
    trips: seasonTrips.length,
    speciesCount,
    distanceKm,
    distanceTripCount: recordedDistances.length,
    favoriteWater,
    bestBait,
    bestMonth,
    bestMoment,
    biggest: bestMoment?.kind === "weight-pb" ? bestMoment.record : null,
    waterCount: new Set(records.map((record) => record.waterId).filter((waterId) => waters.some((water) => water.id === waterId))).size,
    narrative,
  };
}

export function createSeasonStoryShareData(story) {
  if (!story || !Number.isInteger(story.year)) throw new Error("Příběh sezóny nemá platný rok.");
  const moment = story.bestMoment?.record;
  return {
    year: story.year,
    catches: story.catches,
    trips: story.trips,
    speciesCount: story.speciesCount,
    distanceKm: story.distanceKm,
    bestMonth: story.bestMonth ? { label: story.bestMonth.label, count: story.bestMonth.count } : null,
    bestBait: story.bestBait ? { label: story.bestBait.label, count: story.bestBait.count } : null,
    bestMoment: moment ? {
      kind: story.bestMoment.kind,
      label: story.bestMoment.label,
      species: moment.species || null,
      weightKg: isMeasuredCatchWeight(moment) ? moment.weightKg : null,
      lengthCm: Number.isFinite(moment.lengthCm) ? moment.lengthCm : null,
    } : null,
  };
}

export function formatSeasonStoryShareText(shareData) {
  const rows = [
    `Můj příběh sezóny ${shareData.year} · CHYTNUCZ`,
    `${shareData.catches} ${catchNoun(shareData.catches)} · ${shareData.speciesCount} druhů · ${shareData.trips} vycházek`,
  ];
  if (shareData.distanceKm !== null) rows.push(`Zaznamenaná vzdálenost vycházek: ${shareData.distanceKm.toLocaleString("cs-CZ")} km`);
  if (shareData.bestMoment) {
    const metrics = [
      shareData.bestMoment.lengthCm !== null ? `${shareData.bestMoment.lengthCm.toLocaleString("cs-CZ")} cm` : null,
      shareData.bestMoment.weightKg !== null ? `${shareData.bestMoment.weightKg.toLocaleString("cs-CZ")} kg` : null,
    ].filter(Boolean).join(" · ");
    rows.push(`${shareData.bestMoment.label}: ${shareData.bestMoment.species || "zapsaný úlovek"}${metrics ? ` · ${metrics}` : ""}`);
  }
  if (shareData.bestBait) rows.push(`Nejčastější úspěšná nástraha: ${shareData.bestBait.label} (${shareData.bestBait.count}×)`);
  if (shareData.bestMonth) rows.push(`Nejlepší měsíc: ${shareData.bestMonth.label} (${shareData.bestMonth.count} úlovků)`);
  return rows.join("\n");
}
