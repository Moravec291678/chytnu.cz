import { createElement } from "react";
import { getOfflineNoticeCopy } from "../components/offlineNoticeCopy.js";
import { getSyncStatusView, runSyncRetry } from "./syncStatusView.js";

const h = createElement;

export default function SyncStatus({ sync, isOnline }) {
  const view = getSyncStatusView(sync, isOnline);
  if (view.kind === "hidden") return null;
  if (view.kind === "error" || view.kind === "offline") {
    const failed = view.kind === "error";
    const copy = getOfflineNoticeCopy(failed ? "error" : "offline", sync?.pending, sync?.errorCode);
    const description = failed && sync?.error
      ? `${sync.error} Místní změny zůstávají uložené ve frontě.` : copy.description;
    return h("div", { className: "sync-status-layer" },
      h("aside", { className: `sync-status-card sync-status-${view.kind}`, role: failed ? "alert" : "status",
        "aria-live": failed ? "assertive" : "polite", "aria-atomic": "true" },
      h("div", null, h("strong", null, copy.title), h("p", null, description)),
      sync?.retry && h("button", { className: "sync-status-retry", type: "button", onClick: () => runSyncRetry(sync) }, copy.retryLabel)));
  }
  const pending = Math.max(0, Number(sync?.pending) || 0);
  const title = view.kind === "syncing" ? "Synchronizuji…" : "Synchronizace dokončena";
  const description = view.kind === "syncing"
    ? pending > 0 ? `Zpracovávám ${pending} čekajících změn.` : "Probíhá synchronizace úlovků, výprav a fotografií."
    : pending > 0 ? `Zbývá ${pending} změn k synchronizaci.` : "Úlovky, výpravy a dostupné fotografie jsou aktuální.";
  return h("div", { className: "sync-status-layer" },
    h("aside", { className: `sync-status-card sync-status-${view.kind}`, role: "status", "aria-live": "polite", "aria-atomic": "true" },
      view.kind === "syncing" && h("span", { className: "sync-status-spinner", "aria-hidden": "true" }),
      h("div", null, h("strong", null, title), h("p", null, description))));
}
