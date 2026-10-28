import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { progressionLedger } from "./progressionLedger.js";
import { serverProgressionClaimRepository } from "./serverProgressionClaimRepository.js";

function sumXp(events) {
  return events.reduce((total, event) => total + (Number.isSafeInteger(event.xp) && event.xp > 0 ? event.xp : 0), 0);
}

export function createServerProgressionReconciliationService({
  auth = firebaseAuth,
  ledger = progressionLedger,
  claimRepository = serverProgressionClaimRepository,
  fetchImpl = (...args) => fetch(...args),
  online = () => typeof navigator === "undefined" || navigator.onLine !== false,
} = {}) {
  const runningOwners = new Set();
  async function reconcile(scope, events) {
    const ownerId = scope?.ownerId;
    if (!ownerId || !online() || auth.currentUserId() !== ownerId || runningOwners.has(ownerId)) return null;
    runningOwners.add(ownerId);
    try {
      const localEvents = events ?? await ledger.list(scope);
      // These Catch rewards are represented by server events (or remain queued); don't fold
      // the client's locally calculated amount into the permanent legacy baseline.
      const claimedCatchIds = new Set((await claimRepository.list(ownerId)).map((claim) => claim.catchId));
      const pendingCatchXp = sumXp(localEvents.filter((event) => (
        event.type.startsWith("catch.") && event.sourceEntityType === "catch" && claimedCatchIds.has(event.sourceEntityId)
      )));
      const token = await auth.currentIdToken();
      if (!token || auth.currentUserId() !== ownerId) return null;
      const response = await fetchImpl("/api/progression/reconcile", {
        method: "POST", credentials: "same-origin",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ localProgressionXp: sumXp(localEvents), pendingCatchXp }),
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (result.mode !== "shadow" || !Number.isSafeInteger(result.serverTotalXp)
        || !Number.isSafeInteger(result.serverEventXp) || !Number.isSafeInteger(result.legacyBaselineXp)) return null;
      return result;
    } catch { return null; }
    finally { runningOwners.delete(ownerId); }
  }
  return { reconcile };
}

export const serverProgressionReconciliationService = createServerProgressionReconciliationService();
