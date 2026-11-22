const USER_MESSAGES = Object.freeze({
  permission_denied: "Synchronizace nebyla povolena serverem. Místní změny zůstávají ve frontě.",
  unauthenticated: "Přihlášení vypršelo. Přihlas se znovu; místní změny zůstávají ve frontě.",
  unavailable: "Synchronizační server není dostupný. Změny zůstávají ve frontě a aplikace to zkusí znovu.",
  network: "Síťové spojení se synchronizací selhalo. Místní změny zůstávají ve frontě.",
  conflict: "Vzdálený záznam se změnil souběžně. Obě verze zůstaly zachované.",
  invalid_request: "Záznam se nepodařilo synchronizovat kvůli neplatným datům. Místní kopie zůstala zachovaná.",
  rules_schema_rejection: "Server odmítl strukturu záznamu. Místní kopie zůstala zachovaná.",
  cloudinary_signing_failure: "Cloudové úložiště odmítlo připravit upload fotografie.",
  cloudinary_signature_expired: "Platnost uploadu vypršela. Při dalším pokusu se obnoví.",
  cloudinary_upload_failure: "Upload fotografie do cloudového úložiště selhal.",
  remote_delivery_failure: "Stažení fotografie z cloudového úložiště selhalo.",
  missing_auth: "Cloudová fotografie vyžaduje přihlášení.",
  invalid_auth_header: "Požadavek na fotografii neměl platnou autorizaci.",
  missing_firebase_user: "Pro synchronizaci fotografií není dostupný přihlášený účet.",
  token_refresh_failed: "Přihlášení k fotografiím se nepodařilo obnovit.",
  firebase_token_invalid: "Server odmítl Firebase přihlášení k fotografiím.",
  firebase_token_expired: "Firebase přihlášení k fotografiím vypršelo.",
  firebase_admin_config_invalid: "Server nemá platnou konfiguraci ověřování fotografií.",
  firebase_project_mismatch: "Server ověřuje fotografie proti nesprávnému Firebase projektu.",
  ownership_denied: "Server odmítl přístup k fotografii tohoto účtu.",
  rate_limited: "Server dočasně omezuje počet požadavků. Synchronizace počká na povolený čas.",
  photo_blob_missing: "Místní soubor fotografie chybí. Otevři úlovek a zkontroluj fotografii.",
  photo_local_blob_unreadable: "Fotografii se nepodařilo přečíst z místního úložiště. Zkontroluj ji v úlovku.",
  photo_content_mismatch: "Fotografie neodpovídá uloženým údajům. Zkontroluj ji v úlovku.",
  invalid_photo_identity: "Server odmítl identitu fotografie. Zkontroluj ji v úlovku.",
  unknown: "Synchronizaci se nepodařilo dokončit. Místní změny zůstávají ve frontě.",
});

export function describeSyncFailure(error, operation = {}) {
  const raw = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const provider = typeof error?.providerCode === "string" ? error.providerCode.toLowerCase()
    : typeof error?.cause?.code === "string" ? error.cause.code.toLowerCase() : "";
  const classificationCode = raw === "unknown" && provider ? provider : raw;
  const status = error?.status ?? error?.cause?.status;
  const code = status === 429 || classificationCode.includes("rate_limit") || provider.includes("resource-exhausted") ? "rate_limited"
    : status === 401 && !Object.hasOwn(USER_MESSAGES, classificationCode) ? "unauthenticated"
    : status === 403 && !Object.hasOwn(USER_MESSAGES, classificationCode) ? "permission_denied"
    : status >= 500 ? "unavailable"
    : classificationCode.includes("network") ? "network"
    : Object.prototype.hasOwnProperty.call(USER_MESSAGES, classificationCode) ? classificationCode
    : classificationCode === "invalid_auth" ? "firebase_token_invalid"
      : classificationCode === "invalid_owner" || classificationCode === "photo_not_owned" ? "ownership_denied"
    : classificationCode.includes("permission-denied") ? "permission_denied"
      : classificationCode.includes("unauthenticated") || classificationCode === "auth_required" ? "unauthenticated"
        : ["unavailable", "deadline-exceeded", "aborted", "internal", "resource-exhausted", "cancelled"]
          .some((value) => classificationCode.includes(value)) || classificationCode.includes("network") ? "unavailable"
          : classificationCode.includes("invalid-argument") || classificationCode.includes("failed-precondition") || classificationCode.includes("invalid_request") ? "rules_schema_rejection"
            : classificationCode.includes("cloudinary") && (classificationCode.includes("sign") || classificationCode.includes("grant")) ? "cloudinary_signing_failure"
              : classificationCode.includes("cloudinary") && classificationCode.includes("download") ? "remote_delivery_failure"
                : classificationCode.includes("cloudinary") || classificationCode.includes("photo_cloud") ? "cloudinary_upload_failure"
                  : "unknown";
  const sourceName = typeof error?.sourceName === "string" ? error.sourceName
    : typeof error?.cause?.name === "string" ? error.cause.name
      : typeof error?.name === "string" ? error.name : "Error";
  const safeName = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(sourceName) ? sourceName : "Error";
  const providerCode = provider && /^[A-Za-z0-9_./:-]{1,100}$/.test(provider) ? provider : null;
  const retryable = typeof error?.retryable === "boolean" ? error.retryable
    : !["permission_denied", "unauthenticated", "rules_schema_rejection", "firebase_token_invalid",
      "missing_firebase_user", "ownership_denied", "invalid_auth_header", "firebase_token_expired",
      "token_refresh_failed", "missing_auth", "invalid_request", "photo_blob_missing",
      "photo_local_blob_unreadable", "photo_content_mismatch", "invalid_photo_identity"].includes(code);
  return Object.freeze({
    code,
    message: USER_MESSAGES[code],
    retryable,
    retryAfterAt: error?.retryAfterAt ?? error?.cause?.retryAfterAt ?? null,
    entityType: operation.entityType ?? error?.entityType ?? "sync",
    operation: operation.operation ?? error?.operation ?? "pull",
    errorName: safeName,
    providerCode,
    firestoreStage: typeof error?.firestoreStage === "string" ? error.firestoreStage : null,
    syncStage: typeof error?.syncStage === "string" ? error.syncStage : null,
  });
}
