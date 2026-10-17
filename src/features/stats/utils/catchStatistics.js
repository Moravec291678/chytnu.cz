import { normalizeText } from "../../../shared/utils/helpers.js";

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

export function getCatchStatistics(catches, trips = [], now = new Date()) {
  const species = groupBy(catches, (item) => normalizeText(item.speciesKey || item.species || ""), (item) => item.species || item.speciesKey || "");
  const methods = groupBy(catches, (item) => item.method?.key || "", (item) => item.method?.label || "");
  const measuredWeight = catches.filter((item) => validMeasurement(item.weightKg));
  const measuredLength = catches.filter((item) => validMeasurement(item.lengthCm));
  const completedTrips = trips.filter((trip) => trip.endedAt && Number.isFinite(Date.parse(trip.endedAt)));
  const activeTrips = trips.filter((trip) => !trip.endedAt);
  const completedTripIds = new Set(completedTrips.map((trip) => trip.id));
  const linkedCatchCount = catches.filter((item) => completedTripIds.has(item.tripId)).length;
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyCatchCounts = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - (5 - index), 1);
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const count = catches.filter((item) => {
      const timestamp = Date.parse(item.caughtAt);
      if (!Number.isFinite(timestamp)) return false;
      const date = new Date(timestamp);
      return date.getFullYear() === year && date.getMonth() === monthIndex;
    }).length;
    return {
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("cs-CZ", { month: "short" }).format(month).replace(/\.$/, ""),
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
