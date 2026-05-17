export function getStartedTripDayLabel(trip) {
  const today = new Date();
  const startedAt = new Date(trip.startedAt);

  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const startedDate = new Date(
    startedAt.getFullYear(),
    startedAt.getMonth(),
    startedAt.getDate(),
  );

  const differenceDays = Math.floor(
    (todayDate - startedDate) / 1000 / 60 / 60 / 24,
  );

  if (differenceDays === 0) {
    return "dnes";
  }

  if (differenceDays === 1) {
    return "včera";
  }

  return startedAt.toLocaleDateString();
}
