import { createElement } from "react";

export default function PhotoSyncStatus({ className = "", compact = false, showHint = false }) {
  return createElement("span", { className: `photo-sync-status ${className}${compact ? " photo-sync-status-compact" : ""}`, role: "status", "aria-live": "polite", "aria-label": "Fotografie se synchronizuje" },
    createElement("span", { className: "photo-sync-status-spinner", "aria-hidden": "true" }),
    !compact && createElement("span", { className: "photo-sync-status-copy" },
      createElement("strong", null, "Synchronizuji…"),
      showHint && createElement("small", null, "Může to chvíli trvat.")));
}
