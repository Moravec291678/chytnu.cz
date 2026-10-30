export const SYNC_STATUS_COMPACT_DELAY_MS = 2_500;

export function getSyncPendingCount(sync) {
  const pending = Math.max(0, Number(sync?.pending) || 0);
  const pullPending = Math.max(0, Number(sync?.pullPending) || 0);
  return pending + pullPending;
}

export function getSyncStatusView(sync, isOnline = true, delayed = false) {
  if (!isOnline || !delayed || sync?.status !== "syncing" || !sync.showSyncStatus) return { kind: "hidden" };
  return { kind: "syncing" };
}

export function runManualSync(sync) {
  return sync?.syncNow?.();
}

export function runSyncRetry(sync) {
  return sync?.retry?.();
}
