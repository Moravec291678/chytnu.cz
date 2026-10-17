// Local data is retained on logout, but another account must not see it.
// Ownerless records remain available until the user explicitly links them.
export function isRecordVisible(record, ownerId) {
  return !record.ownerId || record.ownerId === ownerId;
}
