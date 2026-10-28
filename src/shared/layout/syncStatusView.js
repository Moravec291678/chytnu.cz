export const SYNC_STATUS_COMPACT_DELAY_MS = 1_500;

export function getSyncPendingCount(sync) {
  const pending = Math.max(0, Number(sync?.pending) || 0);
  const pullPending = Math.max(0, Number(sync?.pullPending) || 0);
  return pending + pullPending;
}

export function getSyncStatusView(sync, isOnline = true, compact = false) {
  if (sync?.status === "error" || (sync?.status === "syncing" && sync.error)) return { kind: "error" };
  if (!isOnline || sync?.status === "offline") return { kind: "offline" };
  if (sync?.status === "syncing" && sync.showSyncStatus) {
    const pending = getSyncPendingCount(sync);
    if (compact && pending === 0) return { kind: "hidden" };
    return { kind: compact ? "syncing-compact" : "syncing", pending };
  }
  if (sync?.status === "success" && sync.showSyncStatus) return { kind: "success" };
  return { kind: "hidden" };
}

export function runManualSync(sync) {
  return sync?.syncNow?.();
}

export function runSyncRetry(sync) {
  return sync?.retry?.();
}
