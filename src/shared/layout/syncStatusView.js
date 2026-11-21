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

export function getSyncDetailMessage(status) {
  switch (status) {
    case "local-pending": return "Změny čekají v tomto zařízení na synchronizaci.";
    case "syncing": return "Probíhá synchronizace změn.";
    case "retry-wait": return "Synchronizace se zatím nepodařila. Změny zůstávají uložené, další pokus proběhne automaticky.";
    case "user-action-required": return "Některé změny potřebují tvou pomoc. Zkontroluj konflikty v Profilu, přihlášení nebo místní fotografii.";
    case "synced": return "Změny jsou synchronizované.";
    default: return "Synchronizace zatím nebyla ověřena.";
  }
}

export function runManualSync(sync) {
  return sync?.syncNow?.();
}

export function runSyncRetry(sync) {
  return sync?.retry?.();
}
