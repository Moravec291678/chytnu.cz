import { createElement } from "react";

export default function PhotoSyncStatus({ className = "photo-sync-status", compact = false }) {
  return createElement("span", { className: `${className}${compact ? " photo-sync-status-compact" : ""}`, role: "status", "aria-live": "polite" },
    createElement("span", { className: "photo-sync-status-spinner", "aria-hidden": "true" }),
    createElement("span", { className: "photo-sync-status-copy" },
      createElement("strong", null, "Fotografie se synchronizuje"),
      !compact && createElement("small", null, "U většího počtu fotografií může synchronizace trvat déle. Aplikaci můžeš dál používat.")));
}
