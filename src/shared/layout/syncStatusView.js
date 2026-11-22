import { isSyncAuthError, MANUAL_SYNC_LIMIT } from "../../features/sync/context/syncRetry.js";
export { isSyncAuthError };

const statusLabels = {
  idle: "Čeká na první kontrolu",
  synced: "Zcela synchronizováno",
  syncing: "Synchronizuji",
  offline: "Čeká na internet",
  "local-pending": "Změny čekají na synchronizaci",
  "retry-wait": "Čeká na automatické opakování",
  "user-action-required": "Některé změny vyžadují zásah",
  conflict: "Konflikt synchronizace",
  paused: "Synchronizace je pozastavená",
};

export const SYNC_AUTOMATIC_MESSAGE = "Změny jsou uložené. Synchronizace proběhne automaticky, jakmile to bude možné.";

export function getSyncPendingCount(sync) {
  return Math.max(0, Number(sync?.pending) || 0) + Math.max(0, Number(sync?.pullPending) || 0);
}

export function getSyncStatusView(sync, isOnline = true) {
  if (!sync?.syncEnabled) return { kind: "hidden" };
  const kind = sync.conflicts > 0 ? "conflict"
    : sync.status === "user-action-required" ? sync.status
    : !isOnline ? "offline" : sync.status;
  const exhausted = kind === "retry-wait" && sync.manualAttempts >= MANUAL_SYNC_LIMIT;
  const authRequired = isSyncAuthError(sync.errorCode);
  const serverWait = Boolean(sync.retryAfterAt);
  const canRetry = isOnline && !exhausted && !serverWait && ["idle", "synced", "local-pending", "retry-wait"].includes(kind);
  const action = kind === "conflict" || kind === "user-action-required" ? {
    href: "/profile#sync-status",
    label: kind === "conflict" ? "Vyřešit konflikt v Profilu" : authRequired ? "Obnovit přihlášení v Profilu" : "Řešení synchronizace v Profilu",
  } : null;
  return { kind, label: statusLabels[kind] ?? statusLabels.idle, exhausted, canRetry, action };
}

export function runManualSync(sync) {
  return sync?.syncNow?.();
}
