import { createElement as h } from "react";
import { Link } from "react-router-dom";
import { getSyncPendingCount, getSyncStatusView, SYNC_AUTOMATIC_MESSAGE } from "./syncStatusView.js";

const symbols = { synced: "✓", syncing: "", offline: "↓", "retry-wait": "↻", "local-pending": "↻",
  "user-action-required": "!", conflict: "!", paused: "Ⅱ", idle: "·" };

function timeLabel(timestamp) {
  return Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toLocaleString("cs-CZ", {
    dateStyle: "short", timeStyle: "short",
  }) : "Zatím neproběhlo";
}

export default function SyncStatus({ sync, isOnline }) {
  const view = getSyncStatusView(sync, isOnline);
  if (view.kind === "hidden") return null;
  const close = event => {
    const details = event.currentTarget.closest("details");
    if (!details?.open) return;
    details.open = false;
    details.querySelector("summary").focus();
  };
  const row = (label, value) => h("div", { key: label }, h("dt", null, label), h("dd", null, value));
  return h("details", { className: "sync-status", "data-status": view.kind,
    onKeyDown: event => { if (event.key === "Escape" && event.currentTarget.open) { event.stopPropagation(); close(event); } } },
  h("summary", { "aria-label": `Synchronizace – ${view.label}`, title: view.label },
    h("span", { className: "sync-status-dot", "aria-hidden": "true" }, symbols[view.kind])),
  h("section", { className: "sync-status-panel", "aria-label": "Stav synchronizace" },
    h("div", { className: "sync-status-heading" },
      h("strong", { role: "status" }, view.label),
      h("button", { type: "button", onClick: close, "aria-label": "Zavřít stav synchronizace" }, "×")),
    h("dl", null,
      row("Čekající záznamy", getSyncPendingCount(sync)),
      row("Čekající fotografie", sync.photoPending ?? 0),
      row("Připojení", isOnline ? "Internet dostupný" : "Bez internetu"),
      row("Poslední úspěch", timeLabel(sync.lastSuccessAt)),
      sync.nextRetryAt && isOnline ? row("Další pokus", timeLabel(sync.nextRetryAt)) : null),
    sync.error ? h("p", { className: "sync-status-error" }, sync.error) : null,
    view.exhausted ? h("p", { role: "status" }, SYNC_AUTOMATIC_MESSAGE) : null,
    view.canRetry ? h("button", { type: "button", onClick: () => sync.retry?.() }, "Zkusit nyní") : null,
    view.action ? h(Link, { to: view.action.href, onClick: close }, view.action.label) : null));
}
