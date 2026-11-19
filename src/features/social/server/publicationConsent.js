// Private, server-written receipt. Never returned in public projections.
export const publicationConsentPath = uid => `users/${uid}/socialPreferences/publication`;
export function consentChoice(input, previous, stamp) {
  // Cached pre-consent clients cannot restore selections after a revocation.
  if (previous?.epoch > 1 && input?.expectedEpoch !== previous.epoch) throw new Error("consent_conflict");
  if (input === undefined) return previous ?? null;
  if (!input || Array.isArray(input) || Object.keys(input).some(key => !["version", "mode", "expectedEpoch"].includes(key))
    || input.version !== 1 || !["public", "private"].includes(input.mode)) throw new Error("invalid_consent");
  if (input.expectedEpoch !== undefined && (!Number.isSafeInteger(input.expectedEpoch) || input.expectedEpoch < 0)) throw new Error("invalid_consent");
  if (input.expectedEpoch !== undefined && input.expectedEpoch !== (previous?.epoch ?? 0)
    || previous && previous.mode !== input.mode && input.expectedEpoch === undefined) throw new Error("consent_conflict");
  if (previous?.version === 1 && previous.mode === input.mode) return previous;
  return { version: 1, mode: input.mode, epoch: (previous?.epoch ?? 0) + 1, acceptedAt: stamp };
}
export function assertPublicationConsent(receipt, visibility) {
  if (visibility !== "private" && receipt?.mode === "private"
    || visibility === "public" && receipt?.mode !== "public") throw new Error("publication_consent_required");
}
export function consentAllowsPost(receipt, row) {
  // Legacy explicit publications remain available until their owner makes a new choice.
  return !receipt || receipt.mode === "public" && row.publicationEpoch === receipt.epoch;
}
export function automaticCatchEligible(record, receipt) {
  return receipt?.version === 1 && receipt.mode === "public" && !record?.deleted
    && record?.privacy?.visibility === "public" && typeof record.speciesKey === "string" && !!record.speciesKey
    && Date.parse(record.createdAt) >= receipt.acceptedAt && Date.parse(record.caughtAt) >= receipt.acceptedAt;
}
