export const SYNC_LIFECYCLE_STATE = Object.freeze({
  LOCAL_PENDING: "local-pending",
  SYNCING: "syncing",
  RETRY_WAIT: "retry-wait",
  SYNCED: "synced",
  USER_ACTION_REQUIRED: "user-action-required",
});

const ACTION_CODES = new Set(["permission_denied", "unauthenticated", "rules_schema_rejection",
  "firebase_token_invalid", "missing_firebase_user", "ownership_denied", "invalid_auth_header"]);

export function completedSyncState({ result, photoResult, summary, retryable = true }) {
  if (summary.conflicts > 0 || photoResult?.needsAttention || (result.status === "error" && !retryable)
    || (summary.pullPending > 0 && !summary.pullRetryable)
    || ACTION_CODES.has(summary.lastErrorCode) || ACTION_CODES.has(photoResult?.errorCode)) {
    return SYNC_LIFECYCLE_STATE.USER_ACTION_REQUIRED;
  }
  if (result.status === "error" || photoResult?.status === "error" || summary.failed > 0 || summary.pullPending > 0) {
    return SYNC_LIFECYCLE_STATE.RETRY_WAIT;
  }
  if (summary.pending > 0) return SYNC_LIFECYCLE_STATE.LOCAL_PENDING;
  return SYNC_LIFECYCLE_STATE.SYNCED;
}

export function logicalSyncKey(operation) {
  if (operation.entityType === "photoCloud") return `catch:${operation.photoCloud?.catchId ?? operation.entityId}`;
  return `${operation.entityType}:${operation.entityId}`;
}
