export function mergeSyncForce(previous, next) {
  return Boolean(previous || next);
}

export const SYNC_PULL_RETRY_DELAY_MS = 45_000;

export function getPullRetryAt(retryable, now = Date.now()) {
  return retryable ? new Date(now + SYNC_PULL_RETRY_DELAY_MS).toISOString() : null;
}


export function nextSyncRetryAt(status, summary, now = Date.now()) {
  if (status === "synced") return null;
  // A permanent problem in one photo must not suppress retries for other photos.
  if (summary.nextRetryAt) return summary.nextRetryAt;
  return ["retry-wait", "local-pending"].includes(status) ? getPullRetryAt(true, now) : null;
}
