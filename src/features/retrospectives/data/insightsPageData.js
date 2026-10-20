import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { getPragueDateParts } from "../../stats/utils/statsPeriod.js";

function pragueMidnight(year, month, day) {
  const target = Date.UTC(year, month - 1, day);
  let timestamp = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getPragueDateParts(new Date(timestamp));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    timestamp += target - represented;
  }
  return new Date(timestamp);
}

export function getInsightsComparableRanges(now = new Date()) {
  const { year, month, day } = getPragueDateParts(now);
  const previousYear = year - 1;
  const previousMonthDay = Math.min(day, new Date(Date.UTC(previousYear, month, 0)).getUTCDate());
  const currentStart = pragueMidnight(year, 1, 1);
  const currentEnd = pragueMidnight(year, month, day + 1);
  const previousStart = pragueMidnight(previousYear, 1, 1);
  const previousEnd = pragueMidnight(previousYear, month, previousMonthDay + 1);
  return {
    current: { start: currentStart, end: currentEnd, year, month, day },
    previous: { start: previousStart, end: previousEnd, year: previousYear, month, day: previousMonthDay },
  };
}

export function recordsInRange(records = [], range, dateField = "caughtAt") {
  return records.filter((record) => {
    const timestamp = Date.parse(record?.[dateField]);
    return Number.isFinite(timestamp) && timestamp >= range.start.getTime() && timestamp < range.end.getTime();
  });
}

export function buildPeriodComparison(catches = [], ranges = getInsightsComparableRanges()) {
  const current = recordsInRange(catches, ranges.current);
  const previous = recordsInRange(catches, ranges.previous);
  const changePercent = previous.length > 0 ? Math.round(((current.length - previous.length) / previous.length) * 100) : null;
  return {
    currentCount: current.length,
    previousCount: previous.length,
    changePercent,
    comparable: previous.length > 0,
    currentRecords: current,
    previousRecords: previous,
  };
}

export function buildLastYearSummary(catches = [], ranges = getInsightsComparableRanges()) {
  const records = recordsInRange(catches, ranges.previous);
  const measured = records.filter(isMeasuredCatchWeight).sort((left, right) => right.weightKg - left.weightKg || String(left.id || "").localeCompare(String(right.id || "")));
  return {
    catchCount: records.length,
    speciesCount: new Set(records.map((record) => record.speciesKey || record.speciesId).filter(Boolean)).size,
    biggestMeasuredCatch: measured[0] || null,
  };
}

export function buildTopWaterInsights(catches = [], trips = [], waters = [], range = getInsightsComparableRanges().current) {
  const knownWaters = new Map(waters.filter((water) => typeof water?.id === "string" && water.id).map((water) => [water.id, water]));
  const totals = new Map();
  const add = (waterId, kind) => {
    const water = knownWaters.get(waterId);
    if (!water) return;
    const item = totals.get(waterId) || { id: waterId, name: water.name || "Revír", catches: 0, trips: 0 };
    item[kind] += 1;
    totals.set(waterId, item);
  };
  recordsInRange(catches, range).forEach((record) => add(record.waterId, "catches"));
  recordsInRange(trips, range, "startedAt").forEach((trip) => add(trip.waterId, "trips"));
  return [...totals.values()].sort((left, right) => (right.catches + right.trips) - (left.catches + left.trips)
    || right.catches - left.catches || left.name.localeCompare(right.name, "cs-CZ") || left.id.localeCompare(right.id)).slice(0, 3);
}

export function buildStableSpeciesInsights(catches = [], range = getInsightsComparableRanges().current) {
  const groups = new Map();
  for (const record of recordsInRange(catches, range)) {
    const id = record.speciesKey || record.speciesId;
    if (typeof id !== "string" || !id.trim()) continue;
    const current = groups.get(id) || { id, name: record.species || id, count: 0 };
    current.count += 1;
    if (record.species) current.name = record.species;
    groups.set(id, current);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "cs-CZ") || left.id.localeCompare(right.id)).slice(0, 3);
}

export function formatInsightsRange(range) {
  const format = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "long", year: "numeric" });
  const lastDay = new Date(range.end.getTime() - 1);
  return `1. ledna – ${format.format(lastDay)}`;
}
