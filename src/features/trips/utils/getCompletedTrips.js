export function getCompletedTrips(trips) {
  return trips.filter((item) => !item.isActive);
}
