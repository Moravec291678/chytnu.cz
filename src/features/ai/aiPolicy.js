import { PRIVATE_JOURNAL_PILOT } from "../../product/config/featureFlags.js";

// Deliberately independent: no capability becomes active through another flag.
export const AI_FEATURES = Object.freeze({ species: false, diary: false, recommendations: !PRIVATE_JOURNAL_PILOT, stories: !PRIVATE_JOURNAL_PILOT });
export const AI_CONSENT_VERSION = 1;

export function hasAiConsent(consent, capability, provider) {
  return consent?.version === AI_CONSENT_VERSION && consent?.capabilities?.[capability] === true
    && typeof provider === "string" && provider.length > 0 && consent.provider === provider
    && Number.isFinite(Date.parse(consent.grantedAt)) && !consent.revokedAt;
}

// Check before obtaining any personal payload or making any network request.
export async function requestAiTask({ capability, consent, provider, flags = AI_FEATURES, getPayload, request }) {
  if (flags[capability] !== true) return { status: "disabled" };
  if (!hasAiConsent(consent, capability, provider)) return { status: "consent_required" };
  try { return await request(await getPayload()); }
  catch { return { status: "unavailable" }; }
}
