import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import FishActivity from "../features/home/components/FishActivity.jsx";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { formatCatchMeasurements } from "../features/catches/data/catchWeight.js";
import { buildInsights } from "../features/retrospectives/data/retrospectives.js";
import {
  buildLastYearSummary,
  buildPeriodComparison,
  buildStableSpeciesInsights,
  buildTopWaterInsights,
  formatInsightsRange,
  getInsightsComparableRanges,
} from "../features/retrospectives/data/insightsPageData.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { getEntitlementState } from "../features/entitlements/data/entitlementAccess.js";
import "./InsightsPage.css";

function InsightSection({ title, children, className = "" }) {
  return <section className={`insights-section ${className}`.trim()}>
    <h2>{title}</h2>
    <div className="insights-section-body">{children}</div>
  </section>;
}

function formatChange(comparison) {
  const catchWord = (count) => count === 1 ? "úlovek" : count >= 2 && count <= 4 ? "úlovky" : "úlovků";
  if (!comparison.comparable) {
    return `Letos ${comparison.currentCount} ${catchWord(comparison.currentCount)}; loni ve stejném období ${comparison.previousCount} ${catchWord(comparison.previousCount)}. Procentuální změnu zatím nelze vypočítat.`;
  }
  const change = comparison.changePercent;
  const sign = change > 0 ? "+" : "";
  return `Letos ${comparison.currentCount} úlovků, loni ${comparison.previousCount}. Změna ${sign}${change} %.`;
}

function InsightsPage() {
  const scope = useDataScope();
  const { state: catchState, refresh: refreshCatches } = useCatches();
  const { state: tripState, refresh: refreshTrips } = useTrips();
  const [waterState, setWaterState] = useState({ scopeKey: null, waters: [], loading: true, error: "" });
  const catches = catchState.catches ?? [];
  const trips = tripState.trips ?? [];
  const now = new Date();
  const ranges = getInsightsComparableRanges(now);

  const loadWaters = useCallback(async () => {
    if (scope.status === "error") {
      setWaterState({ scopeKey: scope.scopeKey, waters: [], loading: false, error: scope.error || "Místní profil se nepodařilo načíst." });
      return;
    }
    if (scope.status !== "ready") return;
    setWaterState({ scopeKey: scope.scopeKey, waters: [], loading: true, error: "" });
    try {
      const waters = await waterRepository.list(scope);
      setWaterState({ scopeKey: scope.scopeKey, waters, loading: false, error: "" });
    } catch {
      setWaterState({ scopeKey: scope.scopeKey, waters: [], loading: false, error: "Revíry se nepodařilo načíst." });
    }
  }, [scope]);

  useEffect(() => { void Promise.resolve().then(loadWaters); }, [loadWaters]);

  const waters = waterState.scopeKey === scope.scopeKey ? waterState.waters : [];
  const waterLoading = scope.status === "loading" || (scope.status === "ready" && (waterState.scopeKey !== scope.scopeKey || waterState.loading));
  const waterError = waterState.scopeKey === scope.scopeKey ? waterState.error : "";
  const loading = catchState.loading || tripState.loading || waterLoading;
  const errors = [catchState.error, tripState.error, waterError].filter(Boolean);
  const patterns = buildInsights(catches);
  const comparison = buildPeriodComparison(catches, ranges);
  const lastYear = buildLastYearSummary(catches, ranges);
  const topWaters = buildTopWaterInsights(catches, trips, waters, ranges.current);
  const topSpecies = buildStableSpeciesInsights(catches, ranges.current);

  const retry = () => { void Promise.all([refreshCatches(), refreshTrips(), loadWaters()]); };

  return <Layout>
    <main className="insights-page">
      <header className="insights-header">
        <Link to="/profile">← Profil</Link>
        <h1>Tipy a postřehy</h1>
        <p>Z tvého deníku</p>
      </header>

      {errors.length > 0 && <section className="insights-error" role="alert">
        <h2>Některá data se nepodařila načíst</h2>
        {errors.map((error) => <p key={error}>{error}</p>)}
        <button type="button" onClick={retry}>Zkusit znovu</button>
      </section>}

      {loading ? <p className="insights-status" role="status">Načítám tvoje přehledy…</p> : catchState.error ? <section className="insights-status">
        Úlovky se nepodařilo načíst, osobní přehledy proto nelze vypočítat.
      </section> : <>
        <InsightSection title="Pattern">
          <p>Nejčastější opakované údaje z úlovků (nejméně 3 záznamy pro každou položku):</p>
          <ul className="insights-list">
            {patterns.map((item) => <li key={item.key}>
              <strong>{item.label}:</strong> {item.value ? `${item.value} (${item.count}×)` : "Nedostatek dat"}
            </li>)}
          </ul>
          <p className="insights-muted">Jde o četnost v deníku, ne o jistotu ani předpověď úspěchu.</p>
        </InsightSection>

        <InsightSection title="Předpověď" className="insights-weather">
          <p>Orientační Fish Activity používá aktuální počasí a dostupné místní předpovědi. Výsledek je vysvětlený odhad, ne předpověď úlovků.</p>
          <FishActivity detailed />
        </InsightSection>

        <InsightSection title="Srovnání">
          <p>Období: {formatInsightsRange(ranges.current)} oproti stejnému období předchozího roku ({formatInsightsRange(ranges.previous)}).</p>
          <strong>{formatChange(comparison)}</strong>
        </InsightSection>

        <InsightSection title="Revíry">
          {waterError
            ? <p>Osobní přehled revírů není dostupný, protože se nepodařilo načíst uložený katalog.</p>
            : tripState.error
              ? <p>Vycházky se nepodařilo načíst, proto jsou zobrazené pouze počty úlovků.</p>
            : topWaters.length
              ? <ol className="insights-ranking">{topWaters.map((water) => <li key={water.id}>
                <Link to={`/waters/${water.id}`}>{water.name}</Link>
                <span>{water.catches} úlovků · {water.trips} vycházek</span>
              </li>)}</ol>
              : <p>Zatím nejsou úlovky ani vycházky propojené se záznamem revíru (waterId).</p>}
        </InsightSection>

        <InsightSection title="Druhy">
          {topSpecies.length
            ? <ol className="insights-ranking">{topSpecies.map((species) => <li key={species.id}>
              <span>{species.name}</span><span>{species.count}× v deníku</span>
            </li>)}</ol>
            : <p>Zatím nejsou záznamy s přiřazeným stabilním ID druhu.</p>}
          <p className="insights-muted">Místní hlášení z okolí nejsou dostupná; komunitní zdroj není zapojen.</p>
        </InsightSection>

        <InsightSection title="Loni touto dobou">
          <p>Stejné období minulého roku: {formatInsightsRange(ranges.previous)}.</p>
          {lastYear.catchCount === 0
            ? <p>Z tohoto období zatím nejsou žádné záznamy.</p>
            : <>
              <p>{lastYear.catchCount} {lastYear.catchCount === 1 ? "úlovek" : "úlovků"} · {lastYear.speciesCount} druhů se stabilním ID.</p>
              {lastYear.biggestMeasuredCatch
                ? <p>Nejtěžší skutečně zvážený úlovek: {lastYear.biggestMeasuredCatch.species || "Druh neuveden"}, {formatCatchMeasurements(lastYear.biggestMeasuredCatch)}.</p>
                : <p>V období není zaznamenána zvážená hmotnost.</p>}
            </>}
        </InsightSection>

        <InsightSection title="Supporter" className="insights-supporter">
          {getEntitlementState(null, "supporter") === "active"
            ? <p>Rozšířená analytika je dostupná s ověřeným Supporter oprávněním.</p>
            : <p>Pokročilé grafy a hlubší analýza jsou zamčené. Ověření členství ani nákup zatím nejsou dostupné.</p>}
        </InsightSection>

        <nav className="insights-links" aria-label="Další přehledy">
          <Link to="/stats">Podrobné statistiky →</Link>
          <Link to="/season-story">Příběh sezóny →</Link>
          <Link to="/year-summary">Roční souhrn →</Link>
        </nav>
      </>}
    </main>
  </Layout>;
}

export default InsightsPage;
