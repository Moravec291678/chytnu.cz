export function getStartedTripDayLabel(trip) {
  const today = new Date();
  const startedAt = trip.startedAt;
  const differenceDays = Math.floor((today - startedAt) / 1000 / 60 / 60 / 24);

  if (differenceDays === 0) {
    return "dnes";
  } else if (differenceDays === 1) {
    return "včera";
  } else if (differenceDays > 1) {
    return startedAt.toLocaleString();
  }
}
