import { normalizeText } from "../../../shared/utils/helpers.js";

export const WATER_HOURLY_MINIMUM_EFFORT_HOURS = 4;

const SEASONS = Object.freeze([
  { key: "spring", label: "Jaro", months: [2, 3, 4] },
  { key: "summer", label: "Léto", months: [5, 6, 7] },
  { key: "autumn", label: "Podzim", months: [8, 9, 10] },
  { key: "winter", label: "Zima", months: [11, 0, 1] },
]);

function normalizedWaterNumber(value) {
  return String(value ?? "").replace(/\s/g, "");
}

export function buildVisitedWaterCollections(waters = [], catches = [], trips = []) {
  return waters.flatMap((water) => {
    if (!water?.id) return [];
    const relatedCatches = catches.filter((record) => record.waterId === water.id);
    const linkedTripIds = new Set(relatedCatches.map((record) => record.tripId).filter(Boolean));
    const relatedTrips = trips.filter((trip) => trip.waterId === water.id || linkedTripIds.has(trip.id));
    if (relatedCatches.length === 0 && relatedTrips.length === 0) return [];
    return [{
      id: water.id,
      name: water.name,
      type: water.type ?? null,
      catchCount: relatedCatches.length,
      tripCount: relatedTrips.length,
    }];
  });
}

export function getWaterRelatedCatches(water, catches = [], waters = []) {
  if (!water) return [];
  const waterNumber = normalizedWaterNumber(water.waterNumber);
  const uniqueWaterNumber = waterNumber
    && waters.filter((item) => normalizedWaterNumber(item.waterNumber) === waterNumber).length === 1;
  return catches.filter((item) => {
    if (item.waterId) return item.waterId === water.id;
    return uniqueWaterNumber && normalizedWaterNumber(item.waterNumber) === waterNumber;
  });
}

export function getWaterRelatedTrips(water, trips = [], catches = []) {
  if (!water) return [];
  const linkedTripIds = new Set(catches.map((record) => record.tripId).filter(Boolean));
  const locations = new Set([water.name, water.waterNumber].filter(Boolean).map(normalizeText));
  return trips.filter((trip) => trip.waterId === water.id
    || linkedTripIds.has(trip.id)
    || locations.has(normalizeText(trip.locationName ?? "")));
}

export function getWaterTodayTripCount(trips = [], now = new Date()) {
  const today = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(today.getTime())) return 0;
  return trips.filter((trip) => {
    const startedAt = new Date(trip.startedAt);
    return Number.isFinite(startedAt.getTime())
      && startedAt.getFullYear() === today.getFullYear()
      && startedAt.getMonth() === today.getMonth()
      && startedAt.getDate() === today.getDate();
  }).length;
}

export function getWaterCatchSeasonCounts(catches = []) {
  const counts = Object.fromEntries(SEASONS.map((season) => [season.key, 0]));
  for (const record of catches) {
    const caughtAt = new Date(record.caughtAt);
    if (!Number.isFinite(caughtAt.getTime())) continue;
    const season = SEASONS.find(({ months }) => months.includes(caughtAt.getMonth()));
    if (season) counts[season.key] += 1;
  }
  return SEASONS.map(({ key, label }) => ({ key, label, count: counts[key] }));
}

function addTripEffortByHour(hourlyEffort, start, end) {
  let cursor = start;
  while (cursor < end) {
    const localDate = new Date(cursor);
    const nextHour = new Date(localDate);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const boundary = nextHour.getTime() > cursor ? nextHour.getTime() : cursor + 60 * 60 * 1000;
    const segmentEnd = Math.min(boundary, end);
    hourlyEffort[localDate.getHours()] += segmentEnd - cursor;
    cursor = segmentEnd;
  }
}

export function getWaterHourlyCatchRate(trips = [], catches = [], {
  minimumEffortHours = WATER_HOURLY_MINIMUM_EFFORT_HOURS,
} = {}) {
  const hourlyEffortMs = Array(24).fill(0);
  const hourlyCatches = Array(24).fill(0);
  const measuredTrips = new Map();
  let totalEffortMs = 0;

  for (const trip of trips) {
    const start = Date.parse(trip.startedAt);
    const end = Date.parse(trip.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const duration = end - start;
    if (duration > 366 * 24 * 60 * 60 * 1000) continue;
    addTripEffortByHour(hourlyEffortMs, start, end);
    totalEffortMs += duration;
    measuredTrips.set(trip.id, true);
  }

  for (const record of catches) {
    if (!measuredTrips.has(record.tripId)) continue;
    const caughtAt = Date.parse(record.caughtAt);
    if (!Number.isFinite(caughtAt)) continue;
    const trip = trips.find((item) => item.id === record.tripId);
    if (caughtAt < Date.parse(trip.startedAt) || caughtAt > Date.parse(trip.endedAt)) continue;
    hourlyCatches[new Date(caughtAt).getHours()] += 1;
  }

  const effortHours = totalEffortMs / (60 * 60 * 1000);
  if (effortHours < minimumEffortHours) {
    return {
      sufficient: false,
      effortHours,
      minimumEffortHours,
      hours: [],
      catchCount: 0,
    };
  }

  const hours = hourlyEffortMs.map((effort, hour) => ({
    hour,
    effortHours: effort / (60 * 60 * 1000),
    catchCount: hourlyCatches[hour],
    catchesPerHour: effort ? hourlyCatches[hour] / (effort / (60 * 60 * 1000)) : null,
  }));
  return {
    sufficient: true,
    effortHours,
    minimumEffortHours,
    hours,
    catchCount: hourlyCatches.reduce((sum, count) => sum + count, 0),
  };
}
