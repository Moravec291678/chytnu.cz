const STATUS = { user_daily_limit: 429, app_daily_limit: 429, text_daily_limit: 429, provider_quota: 429,
  request_in_progress: 409, provider_capacity: 503, provider_throttled: 503, provider_timeout: 504, provider_auth: 503,
  provider_configuration: 503, invalid_ai_response: 503, network_unavailable: 503, quota_unavailable: 503,
  account_unavailable: 403, ai_disabled: 503 };
export class AiServiceError extends Error {
  constructor(code, { retryAt = null, providerStatus = null, providerCode = null } = {}) {
    super("AI provider unavailable.");
    this.name = "AiServiceError";
    this.aiCode = Object.hasOwn(STATUS, code) ? code : "network_unavailable";
    this.aiStatus = STATUS[this.aiCode];
    this.retryAt = typeof retryAt === "string" && Number.isFinite(Date.parse(retryAt)) ? retryAt : null;
    this.providerStatus = Number.isInteger(providerStatus) ? providerStatus : null;
    this.providerCode = Number.isInteger(providerCode) ? providerCode : null;
  }
}
export const nextUtcDay = (now = Date.now()) => new Date((Math.floor(now / 86_400_000) + 1) * 86_400_000).toISOString();
// Strict allowlist: never log exceptions, headers, URLs, prompts, IDs or payloads.
export function safeAiDiagnostic(error, emit = (event) => console.warn(JSON.stringify(event))) {
  emit({ event: "ai_request_rejected", code: error instanceof AiServiceError ? error.aiCode : "ai_unavailable",
    ...(error instanceof AiServiceError ? { providerStatus: error.providerStatus, providerCode: error.providerCode } : {}) });
}
