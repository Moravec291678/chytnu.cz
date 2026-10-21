export function mergeSyncForce(previous, next) {
  return Boolean(previous || next);
}

export const SYNC_PULL_RETRY_DELAY_MS = 45_000;

export function getPullRetryAt(retryable, now = Date.now()) {
  return retryable ? new Date(now + SYNC_PULL_RETRY_DELAY_MS).toISOString() : null;
}
