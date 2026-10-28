import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { useCatches } from "../../catches/context/useCatches.js";
import { useTrips } from "../../trips/context/useTrips.js";
import { buildCatchRewardFromLedger, buildLedgerProgressionSummary, progressionLedger, summaryForXp } from "../data/progressionLedger.js";
import { serverProgressionReconciliationService } from "../data/serverProgressionReconciliationService.js";
import { ProgressionContext } from "./progressionContextValue.js";

export function ProgressionProvider({ children }) {
  const scope = useDataScope();
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();
  const [events, setEvents] = useState([]);
  const [serverTotals, setServerTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activeScopeKey = useRef(null);

  const refresh = useCallback(async () => {
    if (scope.status !== "ready" || catchState.loading || tripState.loading) return;
    const requestedScopeKey = scope.scopeKey;
    setLoading(true);
    try {
      const result = await progressionLedger.reconcile(scope);
      if (activeScopeKey.current !== requestedScopeKey) return;
      setEvents(result.events);
      if (scope.ownerId) {
        void serverProgressionReconciliationService.reconcile(scope, result.events).then((totals) => {
          if (totals && activeScopeKey.current === requestedScopeKey) setServerTotals(totals);
        });
      } else setServerTotals(null);
      setError("");
    } catch (refreshError) {
      if (activeScopeKey.current !== requestedScopeKey) return;
      setError(refreshError?.message || "Rybářský postup se nepodařilo načíst.");
    } finally {
      if (activeScopeKey.current === requestedScopeKey) setLoading(false);
    }
  }, [catchState.loading, scope, tripState.loading]);

  useEffect(() => {
    activeScopeKey.current = scope.status === "ready" ? scope.scopeKey : null;
    Promise.resolve().then(() => {
      if (activeScopeKey.current !== scope.scopeKey) return;
      setEvents([]);
      setServerTotals(null);
      setLoading(true);
      setError("");
    });
    if (scope.status !== "ready") return undefined;
    queueMicrotask(refresh);
    window.addEventListener("chytnu:progression-changed", refresh);
    window.addEventListener("chytnu:local-data-restored", refresh);
    return () => {
      window.removeEventListener("chytnu:progression-changed", refresh);
      window.removeEventListener("chytnu:local-data-restored", refresh);
      if (activeScopeKey.current === scope.scopeKey) activeScopeKey.current = null;
    };
  }, [refresh, scope.status, scope.scopeKey]);

  const summary = useMemo(() => {
    const local = buildLedgerProgressionSummary(events, catchState.catches, tripState.trips);
    if (!scope.ownerId || !serverTotals) return local;
    return {
      ...local,
      ...summaryForXp(serverTotals.serverTotalXp),
      legacyBaselineXp: serverTotals.legacyBaselineXp,
      serverConfirmedXp: serverTotals.serverEventXp,
    };
  }, [events, catchState.catches, tripState.trips, scope.ownerId, serverTotals]);
  const rewardForCatch = useCallback(
    (catchId, eventIds) => buildCatchRewardFromLedger(events, catchId, summary, eventIds),
    [events, summary],
  );
  const useStreakFreeze = useCallback(async () => {
    const result = await progressionLedger.useStreakFreeze(scope);
    const reconciled = await progressionLedger.reconcile(scope);
    if (activeScopeKey.current === scope.scopeKey) setEvents(reconciled.events);
    return result;
  }, [scope]);
  const isChallengeCompleted = useCallback((challengeId, periodKey) => events.some((event) => (
    event.type === "challenge.completed" && event.reasonKey === `challenge.completed:${challengeId}:${periodKey}`
  )), [events]);
  const value = useMemo(() => ({
    events, summary, loading, error, refresh, rewardForCatch, isChallengeCompleted, useStreakFreeze,
  }), [events, summary, loading, error, refresh, rewardForCatch, isChallengeCompleted, useStreakFreeze]);
  return <ProgressionContext.Provider value={value}>{children}</ProgressionContext.Provider>;
}
