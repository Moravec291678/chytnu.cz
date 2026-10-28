function safeXp(value) {
  const xp = Number(value);
  return Number.isSafeInteger(xp) && xp > 0 ? xp : 0;
}

/** Keep old locally-earned XP as a monotonic baseline, then add the server's unique event total. */
export function reconcileProgressionTotals({
  legacyBaselineXp = 0,
  serverEventXp = 0,
  localProgressionXp = 0,
  pendingCatchXp = 0,
}) {
  const baseline = safeXp(legacyBaselineXp);
  const confirmed = safeXp(serverEventXp);
  const local = safeXp(localProgressionXp);
  const pending = safeXp(pendingCatchXp);
  const observedLegacy = Math.max(0, local - confirmed - pending);
  const nextLegacyBaselineXp = Math.max(baseline, observedLegacy);
  const serverTotalXp = nextLegacyBaselineXp + confirmed;
  return {
    legacyBaselineXp: nextLegacyBaselineXp,
    serverEventXp: confirmed,
    serverTotalXp,
    // This is the canonical online total. Offline clients continue showing their local ledger
    // because no server reconciliation result is available to overlay it.
    displayedXp: serverTotalXp,
  };
}
