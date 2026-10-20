import { normalizeText } from "../../../shared/utils/helpers.js";
import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { getPragueDateParts } from "./statsPeriod.js";

export const PATTERN_MIN_SAMPLE_SIZE = 3;

function groupBy(items, getKey, getLabel) {
  const groups = new Map();
  for (const item of items) {
    const label = getLabel(item)?.trim();
    const key = getKey(item) || normalizeText(label || "");
    if (!key || !label) continue;
    const group = groups.get(key) ?? { key, label, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "cs"));
}

function validMeasurement(value) {
  return Number.isFinite(value) && value >= 0;
}

function mostCommon(values) {
  const groups = new Map();
  for (const value of values) {
    if (!value?.key || !value.label) continue;
    const current = groups.get(value.key) ?? { key: value.key, label: value.label, count: 0 };
    current.count += 1;
    groups.set(value.key, current);
  }
  const ranked = [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "cs-CZ"));
  if (!ranked.length) return null;
  const count = ranked[0].count;
  if (values.length < PATTERN_MIN_SAMPLE_SIZE || count < 2) return null;
  return { labels: ranked.filter((item) => item.count === count).map((item) => item.label), count, sampleCount: values.length };
}

function averageMeasurement(records, getValue) {
  const values = records.map(getValue).filter((value) => Number.isFinite(value));
  if (values.length < PATTERN_MIN_SAMPLE_SIZE) return null;
  return { value: values.reduce((total, value) => total + value, 0) / values.length, sampleCount: values.length };
}

export function getCatchPatterns(catches) {
  const timeSlots = [];
  const locations = [];
  const baits = [];
  const months = [];
  for (const record of catches) {
    const timestamp = Date.parse(record.caughtAt);
    if (Number.isFinite(timestamp)) {
      const date = getPragueDateParts(new Date(timestamp));
      const startHour = Math.floor(date.hour / 3) * 3;
      const endHour = (startHour + 3) % 24;
      const label = `${String(startHour).padStart(2, "0")}–${String(endHour).padStart(2, "0")} h`;
      timeSlots.push({ key: String(startHour), label });
      months.push({ key: String(date.month), label: new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", month: "long" }).format(new Date(Date.UTC(2020, date.month - 1, 15))) });
    }

    const location = typeof record.locationName === "string" ? record.locationName.trim() : "";
    if (location) locations.push({ key: normalizeText(location), label: location });
    const seenBaits = new Set();
    for (const bait of Array.isArray(record.baits) ? record.baits : []) {
      const label = typeof bait.label === "string" ? bait.label.trim() : "";
      const key = normalizeText(label);
      if (!key || seenBaits.has(key)) continue;
      seenBaits.add(key);
      baits.push({ key, label });
    }
  }

  return {
    time: mostCommon(timeSlots),
    location: mostCommon(locations),
    bait: mostCommon(baits),
    month: mostCommon(months),
    pressureHpa: averageMeasurement(catches, (record) => record.conditions?.pressureHpa),
    waterTemperatureC: averageMeasurement(catches, (record) => record.conditions?.waterTempC ?? record.conditions?.waterTemperatureC),
  };
}

export function getCatchStatistics(catches, trips = [], now = new Date()) {
  const species = groupBy(catches, (item) => normalizeText(item.speciesKey || item.species || ""), (item) => item.species || item.speciesKey || "");
  const methods = groupBy(catches, (item) => item.method?.key || "", (item) => item.method?.label || "");
  const measuredWeight = catches.filter(isMeasuredCatchWeight);
  const measuredLength = catches.filter((item) => validMeasurement(item.lengthCm));
  const completedTrips = trips.filter((trip) => trip.endedAt && Number.isFinite(Date.parse(trip.endedAt)));
  const activeTrips = trips.filter((trip) => !trip.endedAt);
  const completedTripIds = new Set(completedTrips.map((trip) => trip.id));
  const linkedCatchCount = catches.filter((item) => completedTripIds.has(item.tripId)).length;
  const nowParts = getPragueDateParts(now);
  const monthlyCatchCounts = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(Date.UTC(nowParts.year, nowParts.month - 1 - (5 - index), 15));
    const year = month.getUTCFullYear();
    const monthIndex = month.getUTCMonth();
    const count = catches.filter((item) => {
      const timestamp = Date.parse(item.caughtAt);
      if (!Number.isFinite(timestamp)) return false;
      const date = getPragueDateParts(new Date(timestamp));
      return date.year === year && date.month === monthIndex + 1;
    }).length;
    return {
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", month: "short" }).format(month).replace(/\.$/, ""),
      count,
    };
  });

  return {
    catchCount: catches.length,
    speciesCount: species.length,
    species,
    methods,
    measuredWeightCount: measuredWeight.length,
    measuredLengthCount: measuredLength.length,
    biggestWeightKg: measuredWeight.reduce((max, item) => max === null || item.weightKg > max ? item.weightKg : max, null),
    longestLengthCm: measuredLength.reduce((max, item) => max === null || item.lengthCm > max ? item.lengthCm : max, null),
    completedTripsCount: completedTrips.length,
    activeTripsCount: activeTrips.length,
    averageCatchesPerCompletedTrip: completedTrips.length ? linkedCatchCount / completedTrips.length : null,
    monthlyCatchCounts,
    datedCatchCount: catches.filter((item) => Number.isFinite(Date.parse(item.caughtAt))).length,
  };
}
