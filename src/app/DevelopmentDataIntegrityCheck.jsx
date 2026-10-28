import { useEffect } from "react";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { useTrips } from "../features/trips/context/useTrips.js";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";

export default function DevelopmentDataIntegrityCheck() {
  const scope = useDataScope();
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();
  const progression = useProgression();

  useEffect(() => {
    if (!import.meta.env.DEV || scope.status !== "ready" || catchState.loading || tripState.loading || progression.loading) return undefined;
    let active = true;
    Promise.all([
      waterRepository.list(scope),
      import("../shared/dataIntegrity/productDataIntegrity.js"),
    ]).then(([waters, integrity]) => {
      if (!active) return;
      const issues = integrity.auditProductDataIntegrity({
        catches: catchState.catches,
        trips: tripState.trips,
        waters,
        rewardEvents: progression.events,
      });
      if (issues.length) console.warn("[ChytnuCz data integrity] Kontrola nalezla nekonzistentní vývojová data.", issues);
    }).catch(() => {
      // Diagnostics never change the application flow or stored user data.
    });
    return () => { active = false; };
  }, [scope, catchState.catches, catchState.loading, tripState.trips, tripState.loading, progression.events, progression.loading]);

  return null;
}
