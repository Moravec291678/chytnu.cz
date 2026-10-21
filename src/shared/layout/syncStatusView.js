export function getSyncStatusView(sync, isOnline = true) {
  if (sync?.status === "error" || (sync?.status === "syncing" && sync.error)) return { kind: "error" };
  if (!isOnline || sync?.status === "offline") return { kind: "offline" };
  if (sync?.status === "syncing" && sync.showSyncStatus) return { kind: "syncing" };
  if (sync?.status === "success" && sync.showSyncStatus) return { kind: "success" };
  return { kind: "hidden" };
}

export function runManualSync(sync) {
  return sync?.syncNow?.();
}

export function runSyncRetry(sync) {
  return sync?.retry?.();
}
