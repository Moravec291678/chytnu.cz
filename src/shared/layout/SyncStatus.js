import { createElement } from "react";
import { getOfflineNoticeCopy } from "../components/offlineNoticeCopy.js";
import { userFacingErrorMessage } from "../errors/userFacingError.js";
import { getSyncStatusView, runSyncRetry } from "./syncStatusView.js";

const h = createElement;

export default function SyncStatus({ sync, isOnline, compact = false }) {
  const view = getSyncStatusView(sync, isOnline, compact);
  if (view.kind === "hidden") return null;
  if (view.kind === "error" || view.kind === "offline") {
    const failed = view.kind === "error";
    const copy = getOfflineNoticeCopy(failed ? "error" : "offline", sync?.pending, sync?.errorCode);
    const syncError = failed ? userFacingErrorMessage(sync?.error, "Zkontroluj připojení a zkus synchronizaci znovu.") : "";
    const description = failed && syncError
      ? `${syncError} Místní změny zůstávají uložené ve frontě.` : copy.description;
    return h("div", { className: "sync-status-layer" },
      h("aside", { className: `sync-status-card sync-status-${view.kind}`, role: failed ? "alert" : "status",
        "aria-live": failed ? "assertive" : "polite", "aria-atomic": "true" },
      h("div", null, h("strong", null, copy.title), h("p", null, description)),
      sync?.retry && h("button", { className: "sync-status-retry", type: "button", onClick: () => runSyncRetry(sync) }, copy.retryLabel)));
  }
  const pending = Math.max(0, Number(sync?.pending) || 0);
  const pullPending = Math.max(0, Number(sync?.pullPending) || 0);
  const pendingCount = pending + pullPending;
  const isSyncing = view.kind === "syncing" || view.kind === "syncing-compact";
  const title = isSyncing ? "Synchronizuji…" : "Synchronizace dokončena";
  const description = isSyncing
    ? pendingCount > 0 ? `Synchronizuji změny a fotografie. Čeká: ${pendingCount}.` : "Probíhá synchronizace úlovků, vycházek a fotografií."
    : pending > 0 ? `Zbývá ${pending} změn k synchronizaci.` : "Úlovky, vycházky a dostupné fotografie jsou aktuální.";
  const isCompact = view.kind === "syncing-compact";
  const presentedKind = isCompact ? "syncing" : view.kind;
  return h("div", { className: "sync-status-layer" },
    h("aside", { className: `sync-status-card sync-status-${presentedKind}${isCompact ? " sync-status-compact" : ""}`, role: "status", "aria-live": "polite", "aria-atomic": "true", "aria-busy": isSyncing },
      h("span", { className: `sync-status-indicator${isCompact ? " sync-status-indicator-count" : ""}`, "aria-hidden": "true" },
        isCompact && h("span", { className: "sync-status-count" }, String(view.pending))),
      h("div", { className: "sync-status-copy" }, h("strong", null, title), h("p", null, description))));
}
