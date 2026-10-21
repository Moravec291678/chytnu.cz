const USER_MESSAGES = Object.freeze({
  permission_denied: "Synchronizace nebyla povolena serverem. Místní změny zůstávají ve frontě.",
  unavailable: "Synchronizační server není dostupný. Změny zůstávají ve frontě a aplikace to zkusí znovu.",
  conflict: "Vzdálený záznam se změnil souběžně. Obě verze zůstaly zachované.",
  invalid_request: "Záznam se nepodařilo synchronizovat kvůli neplatným datům. Místní kopie zůstala zachovaná.",
  unknown: "Synchronizaci se nepodařilo dokončit. Místní změny zůstávají ve frontě.",
});

export function describeSyncFailure(error, operation = {}) {
  const code = Object.prototype.hasOwnProperty.call(USER_MESSAGES, error?.code) ? error.code : "unknown";
  return Object.freeze({
    code,
    message: USER_MESSAGES[code],
    retryable: Boolean(error?.retryable || code === "unavailable"),
    entityType: operation.entityType ?? "sync",
    operation: operation.operation ?? "pull",
    providerCode: typeof error?.providerCode === "string" ? error.providerCode : null,
  });
}
