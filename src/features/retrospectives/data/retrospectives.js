import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";

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
function topOrNull(records, key, label) { return ranking(records, key, label)[0] || null; }

export function buildInsights(catches) {
  const dated = catches.map((record) => ({ record, date: validDate(record) })).filter((item) => item.date);
  const species = topOrNull(catches, (r) => r.speciesKey || r.species, (r) => r.species);
  const method = topOrNull(catches, (r) => r.method?.key, (r) => r.method?.label);
  const bait = topOrNull(catches.flatMap((record) => (record.baits || []).map((item) => ({ ...item, species: record.species }))), (r) => r.key || r.label, (r) => r.label);
  const hours = ranking(dated, ({ date }) => String(date.getHours()), ({ date }) => `${String(date.getHours()).padStart(2, "0")}:00`);
  const months = ranking(dated, ({ date }) => String(date.getMonth()), ({ date }) => new Intl.DateTimeFormat("cs-CZ", { month: "long" }).format(date));
  const enough = (item) => item && item.count >= 3;
  return [
    { key: "time", label: "Nejčastější čas", value: enough(hours[0]) ? hours[0].label : null, count: enough(hours[0]) ? hours[0].count : 0 },
    { key: "method", label: "Nejčastější metoda", value: enough(method) ? method.label : null, count: enough(method) ? method.count : 0 },
    { key: "bait", label: "Nejčastější nástraha", value: enough(bait) ? bait.label : null, count: enough(bait) ? bait.count : 0 },
    { key: "month", label: "Nejproduktivnější měsíc", value: enough(months[0]) ? months[0].label : null, count: enough(months[0]) ? months[0].count : 0 },
    { key: "species", label: "Nejčastější druh", value: enough(species) ? species.label : null, count: enough(species) ? species.count : 0 },
  ];
}

export function buildYearSummary(catches, trips, year) {
  const records = catches.filter((record) => validDate(record)?.getFullYear() === year);
  const datedTrips = trips.filter((trip) => [trip.startedAt, trip.createdAt].some((value) => {
    const date = Date.parse(value); return Number.isFinite(date) && new Date(date).getFullYear() === year;
  }));
  const measuredWeight = records.filter(isMeasuredCatchWeight).sort((a, b) => b.weightKg - a.weightKg);
  const measuredLength = records.filter((record) => Number.isFinite(record.lengthCm)).sort((a, b) => b.lengthCm - a.lengthCm);
  const months = ranking(records, (r) => String(validDate(r)?.getMonth()), (r) => new Intl.DateTimeFormat("cs-CZ", { month: "long" }).format(validDate(r)));
  const uniqueSpecies = new Set(records.map((r) => r.speciesKey || r.species).filter(Boolean));
  return { year, catches: records.length, trips: datedTrips.length, species: uniqueSpecies.size,
    biggest: measuredWeight[0] || null, longest: measuredLength[0] || null,
    bestMonth: months[0] || null, bestMethod: topOrNull(records, (r) => r.method?.key, (r) => r.method?.label),
    bestBait: topOrNull(records.flatMap((r) => r.baits || []), (r) => r.key || r.label, (r) => r.label),
    recordsWithWeight: measuredWeight.length, recordsWithLength: measuredLength.length };
}

export function buildSeasonStory(catches, trips, seasonYear) {
  const records = catches.filter((record) => {
    const date = validDate(record);
    return date && ((date.getMonth() >= 2 && date.getMonth() <= 10 && date.getFullYear() === seasonYear)
      || (date.getMonth() === 11 && date.getFullYear() === seasonYear - 1)
      || (date.getMonth() <= 1 && date.getFullYear() === seasonYear + 1));
  });
  const start = new Date(seasonYear - 1, 11, 1).getTime();
  const end = new Date(seasonYear + 1, 2, 1).getTime();
  const seasonTrips = trips.filter((trip) => {
    const time = Date.parse(trip.startedAt || trip.createdAt);
    return Number.isFinite(time) && time >= start && time < end;
  });
  const speciesCount = new Set(records.map((r) => r.speciesKey || r.species).filter(Boolean)).size;
  const waters = new Set(records.map((r) => r.locationName).filter(Boolean));
  const biggest = records.filter(isMeasuredCatchWeight).sort((a, b) => b.weightKg - a.weightKg)[0] || null;
  const bestMonth = ranking(records, (record) => String(validDate(record)?.getMonth()), (record) => new Intl.DateTimeFormat("cs-CZ", { month: "long" }).format(validDate(record)))[0] || null;
  return { year: seasonYear, catches: records.length, trips: seasonTrips.length, speciesCount, waterCount: waters.size, biggest, bestMonth };
}
