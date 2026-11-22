export const MANUAL_SYNC_LIMIT = 3;
export const SYNC_PULL_RETRY_DELAY_MS = 45_000;

export function parseRetryAfter(value, now = Date.now()) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const time = /^\d+$/.test(text) ? now + Number(text) * 1000 : Date.parse(text);
  return Number.isFinite(time) && time > now && time <= 8.64e15 ? time : null;
}

export function syncRetryAt(attempts, { now = Date.now(), base = 5_000, retryAfterAt, random = Math.random } = {}) {
  const delay = Math.min(30 * 60_000, base * 2 ** Math.min(Math.max(0, attempts - 1), 10) * (.8 + .4 * random()));
  return new Date(Math.max(now + delay, retryAfterAt || 0)).toISOString();
}

export function getPullRetryAt(retryable, now = Date.now(), attempts = 1, retryAfterAt, random) {
  return retryable ? syncRetryAt(attempts, { now, base: SYNC_PULL_RETRY_DELAY_MS, retryAfterAt, random }) : null;
}

export function nextSyncRetryAt(status, summary, now = Date.now()) {
  if (status === "synced") return null;
  const scheduled = [summary.nextRetryAt, summary.nextPhotoProbeAt].filter(Boolean).sort()[0];
  const serverTime = summary.retryAfterAt > now ? new Date(summary.retryAfterAt).toISOString() : null;
  if (summary.paused && !summary.nextPhotoProbeAt) return null;
  const next = [summary.retryAt, scheduled, serverTime].filter(Boolean).sort().at(-1);
  if (next) return next;
  return ["retry-wait", "local-pending"].includes(status) ? getPullRetryAt(true, now) : null;
}

export function isDueForSync(operation, { now = Date.now(), force = false } = {}) {
  if (operation.status === "conflict" || operation.retryAfterAt > now) return false;
  if (operation.status !== "failed") return true;
  if (operation.retryable === false) return force;
  return force || !operation.nextAttemptAt || Date.parse(operation.nextAttemptAt) <= now;
}

export function isSyncAuthError(code) {
  return ["unauthenticated", "firebase_token_invalid", "firebase_token_expired", "missing_firebase_user",
    "missing_auth", "token_refresh_failed", "invalid_auth_header"].includes(code);
}

export function manualSyncAllowed(control, now = Date.now()) {
  return (control?.manualAttempts ?? 0) < MANUAL_SYNC_LIMIT && !(control?.retryAfterAt > now);
}

export function finishSyncCycle(previous, outcome, now = Date.now()) {
  const failed = ["retry-wait", "user-action-required"].includes(outcome.status);
  const failureKey = failed ? (outcome.errorCode || outcome.status) : null;
  const same = failureKey && (!previous.failureKey || previous.failureKey === failureKey);
  const failures = outcome.backoff ? (previous.failures ?? 0) + 1 : 0;
  return {
    status: outcome.status,
    failureKey,
    errorCode: outcome.errorCode || "",
    error: outcome.error || "",
    manualAttempts: same && outcome.status === "retry-wait" ? previous.manualAttempts ?? 0 : 0,
    failures,
    retryAt: outcome.backoff ? getPullRetryAt(true, now, failures, outcome.retryAfterAt) : null,
    retryAfterAt: outcome.retryAfterAt > now ? outcome.retryAfterAt : null,
    paused: Boolean(outcome.paused),
    lastSuccessAt: outcome.status === "synced" ? new Date(now).toISOString() : previous.lastSuccessAt ?? null,
  };
}
