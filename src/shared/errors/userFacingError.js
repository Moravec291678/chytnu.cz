const TECHNICAL_ERROR = /(?:firebase(?:error)?|firestore|indexeddb|idbobjectstore|domexception|networkerror|typeerror|referenceerror|securityerror|notfounderror|failed to fetch|failed to execute|request failed|https?:\/\/|\b(?:auth|storage|permission-denied|unauthenticated|unavailable)\/| at [\w$.]+\s*\()/i;

/** Keep actionable domain messages, but never surface browser/SDK exception details. */
export function userFacingErrorMessage(error, fallback) {
  const message = typeof error === "string" ? error : error?.message;
  const technicalName = typeof error?.name === "string"
    && /^(?:AbortError|DataError|DOMException|InvalidStateError|NetworkError|NotFoundError|QuotaExceededError|SecurityError|TypeError|ReferenceError)$/i.test(error.name);
  if (!technicalName && typeof message === "string" && message.trim() && !TECHNICAL_ERROR.test(message)) return message.trim();
  return fallback;
}
