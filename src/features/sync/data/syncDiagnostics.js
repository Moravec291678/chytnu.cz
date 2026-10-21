const USER_MESSAGES = Object.freeze({
  permission_denied: "Synchronizace nebyla povolena serverem. Místní změny zůstávají ve frontě.",
  unauthenticated: "Přihlášení vypršelo. Přihlas se znovu; místní změny zůstávají ve frontě.",
  unavailable: "Synchronizační server není dostupný. Změny zůstávají ve frontě a aplikace to zkusí znovu.",
  network: "Síťové spojení se synchronizací selhalo. Místní změny zůstávají ve frontě.",
  conflict: "Vzdálený záznam se změnil souběžně. Obě verze zůstaly zachované.",
  invalid_request: "Záznam se nepodařilo synchronizovat kvůli neplatným datům. Místní kopie zůstala zachovaná.",
  rules_schema_rejection: "Server odmítl strukturu záznamu. Místní kopie zůstala zachovaná.",
  cloudinary_signing_failure: "Cloudové úložiště odmítlo připravit upload fotografie.",
  cloudinary_upload_failure: "Upload fotografie do cloudového úložiště selhal.",
  remote_delivery_failure: "Stažení fotografie z cloudového úložiště selhalo.",
  unknown: "Synchronizaci se nepodařilo dokončit. Místní změny zůstávají ve frontě.",
});

export function describeSyncFailure(error, operation = {}) {
  const raw = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const code = Object.prototype.hasOwnProperty.call(USER_MESSAGES, raw) ? raw
    : raw.includes("permission-denied") ? "permission_denied"
      : raw.includes("unauthenticated") || raw === "auth_required" ? "unauthenticated"
        : raw.includes("unavailable") || raw.includes("network") ? "network"
          : raw.includes("invalid-argument") || raw.includes("invalid_request") ? "rules_schema_rejection"
            : raw.includes("cloudinary") && (raw.includes("sign") || raw.includes("grant")) ? "cloudinary_signing_failure"
              : raw.includes("cloudinary") && raw.includes("download") ? "remote_delivery_failure"
                : raw.includes("cloudinary") || raw.includes("photo_cloud") ? "cloudinary_upload_failure"
                  : "unknown";
  return Object.freeze({
    code,
    message: USER_MESSAGES[code],
    retryable: Boolean(error?.retryable || code === "unavailable" || code === "network" || code.startsWith("cloudinary_") || code === "remote_delivery_failure"),
    entityType: operation.entityType ?? "sync",
    operation: operation.operation ?? "pull",
    providerCode: typeof error?.providerCode === "string" ? error.providerCode : null,
  });
}
