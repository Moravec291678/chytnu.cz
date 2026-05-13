export function getTripsCount(MOCK_TRIPS) {
  return MOCK_TRIPS.length;
}

export function getTotalTripsHours(trips) {
  const totalHours = trips.reduce(
    (acc, trip) =>
      (acc +=
        (trip.endedAt
          ? new Date(trip.endedAt) - new Date(trip.startedAt)
          : new Date() - new Date(trip.startedAt)) /
        1000 /
        60 /
        60),
    0,
  );
  return Math.floor(totalHours);
}
