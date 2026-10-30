import { createElement } from "react";
import { getSyncStatusView } from "./syncStatusView.js";

export default function SyncStatus({ sync, isOnline, compact = false }) {
  if (getSyncStatusView(sync, isOnline, compact).kind === "hidden") return null;
  return createElement("span", { className: "sync-status-minimal", role: "status", "aria-live": "polite",
    "aria-label": "Synchronizace probíhá", "aria-busy": true },
  createElement("span", { className: "sync-status-minimal-spinner", "aria-hidden": "true" }));
}
