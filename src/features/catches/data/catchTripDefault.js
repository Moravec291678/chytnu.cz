export function resolveCatchTripId({ isEditing, currentTripId, requestedTripId, activeTripId }) {
  if (isEditing) return currentTripId ?? "";
  return requestedTripId || currentTripId || activeTripId || "";
}
