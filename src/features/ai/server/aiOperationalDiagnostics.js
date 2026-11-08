const CAPABILITIES = ["species", "stories", "diary", "recommendations"];
const ERROR_CODES = new Set(["provider_quota", "provider_capacity", "provider_throttled", "provider_timeout", "provider_auth",
  "provider_configuration", "invalid_ai_response", "network_unavailable", "ai_unavailable", "source_changed"]);
const validCount = value => Number.isSafeInteger(value) && value >= 0 && value < 1_000_000;
const count = value => validCount(value) ? value : 0;

// Small daily aggregates only. No account IDs, prompts, catches, photo paths or
// fishing locations enter this collection; it is never client-writable.
export function createAiOperationalDiagnostics({ db, now = Date.now } = {}) {
  return async ({ capability, status, code } = {}) => {
    if (!CAPABILITIES.includes(capability) || !["success", "error"].includes(status)) return false;
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || typeof db?.runTransaction !== "function") return false;
    const dayUtc = new Date(timestamp).toISOString().slice(0, 10);
    const ref = db.doc(`adminAiDiagnostics/${dayUtc}`);
    try {
      return await db.runTransaction(async transaction => {
        const previous = await transaction.get(ref);
        const data = previous.exists ? previous.data() : {};
        if (previous.exists && (![data.providerRequests, data.providerSuccesses, data.providerErrors].every(validCount)
          || CAPABILITIES.some(key => !validCount(data.byCapability?.[key])))) return false;
        const byCapability = Object.fromEntries(CAPABILITIES.map(key => [key, count(data.byCapability?.[key])]));
        byCapability[capability]++;
        transaction.set(ref, { dayUtc, providerRequests: count(data.providerRequests) + 1,
          providerSuccesses: count(data.providerSuccesses) + (status === "success" ? 1 : 0),
          providerErrors: count(data.providerErrors) + (status === "error" ? 1 : 0), byCapability,
          lastErrorCode: status === "error" ? ERROR_CODES.has(code) ? code : "ai_unavailable" : data.lastErrorCode && ERROR_CODES.has(data.lastErrorCode) ? data.lastErrorCode : null,
          lastRequestAt: new Date(timestamp).toISOString() });
        return true;
      });
    } catch { return false; } // Monitoring cannot break an otherwise usable result.
  };
}
