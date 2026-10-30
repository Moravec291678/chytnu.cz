import { createElement } from "react";
import { getSyncStatusView, getSyncPendingCount } from "./syncStatusView.js";

export default function SyncStatus({ sync, isOnline, compact = false }) {
  if (getSyncStatusView(sync, isOnline, compact).kind === "hidden") return null;
  const pending = getSyncPendingCount(sync);
  return createElement("span", { className: "sync-status-minimal", role: "status", "aria-live": "polite",
    "aria-label": "Synchronizace probíhá", "aria-busy": true },
  createElement("span", { className: "sync-status-minimal-spinner", "aria-hidden": "true" }),
  createElement("a", { href: "/notifications", className: "sync-status-detail" }, pending > 0 ? `Zbývá ${pending}` : "Synchronizuji…"),
  createElement("button", { type: "button", onClick: () => sync.hideStatus?.(), "aria-label": "Skrýt stav synchronizace" }, "×"));
}
