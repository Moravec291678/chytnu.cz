import { getTripDurationMs } from "../data/tripModel.js";

export function getTripsCount(trips) {
  return Array.isArray(trips) ? trips.length : 0;
}

export function getTotalTripsHours(trips, now = Date.now()) {
  const totalMs = (Array.isArray(trips) ? trips : [])
    .reduce((total, trip) => total + (getTripDurationMs(trip, now) ?? 0), 0);
  return Math.floor(totalMs / 3_600_000);
}

export function getTripCatchCount(catches, trips) {
  const tripIds = new Set((Array.isArray(trips) ? trips : []).map((trip) => trip.id).filter(Boolean));
  return (Array.isArray(catches) ? catches : []).filter((record) => record.tripId && tripIds.has(record.tripId)).length;
}
