export function getActiveTrip(trips) {
  return trips.find((item) => item.isActive);
}
