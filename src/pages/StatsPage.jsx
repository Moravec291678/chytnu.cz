import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { getCatchOutcomeStats } from "../features/home/utils/profileStats";
import { getCatchStatistics } from "../features/stats/utils/catchStatistics";
import "./StatsPage.css";

function formatNumber(value, maximumFractionDigits = 1) {
  return value.toLocaleString("cs-CZ", { maximumFractionDigits });
}

function formatCatchCount(count) {
  const remainder = count % 100;
  const lastDigit = count % 10;
  const noun = remainder >= 11 && remainder <= 14 ? "úlovků"
    : lastDigit === 1 ? "úlovek"
      : lastDigit >= 2 && lastDigit <= 4 ? "úlovky" : "úlovků";
  return `${formatNumber(count, 0)} ${noun}`;
}

function StatCard({ label, value, note }) {
  return <article className="stats-metric">
    <span className="stats-metric-label">{label}</span>
    <strong className="stats-metric-value">{value}</strong>
    {note && <span className="stats-metric-note">{note}</span>}
  </article>;
}

function Ranking({ title, items }) {
  if (!items.length) return null;
  const top = items.slice(0, 4);
  return <section className="stats-panel" aria-label={title}>
    <h2>{title}</h2>
    <ol className="stats-ranking">
      {top.map((item) => <li key={item.key}>
        <span>{item.label}</span>
        <strong>{item.count}×</strong>
      </li>)}
    </ol>
  </section>;
}

function StatsPage() {
  const { state: catchState, refresh: refreshCatches } = useCatches();
  const { state: tripState, refresh: refreshTrips } = useTrips();
  const stats = getCatchStatistics(catchState.catches, tripState.trips);
  const outcomes = getCatchOutcomeStats(catchState.catches);
  const loading = catchState.loading || tripState.loading;

  return <Layout>
    <div className="stats-page">
      <header className="stats-header">
        <h1>Statistiky</h1>
        <p>Přehled z tvých uložených úlovků a výprav.</p>
      </header>

      {(catchState.error || tripState.error) && <div className="stats-error" role="alert">
        <p>{[catchState.error, tripState.error].filter(Boolean).join(" ")}</p>
        {catchState.error && <button type="button" onClick={refreshCatches}>Načíst úlovky znovu</button>}
        {tripState.error && <button type="button" onClick={refreshTrips}>Načíst výpravy znovu</button>}
      </div>}

      {loading ? <p className="stats-status" role="status">Načítám místní statistiky…</p> : <>
        {stats.catchCount === 0 ? <section className="stats-empty">
          <h2>Historie začíná prvním úlovkem</h2>
          <p>Jakmile uložíš úlovek, najdeš tu přehled druhů, měření a vývoje v čase. Záznam přidáš tlačítkem + dole.</p>
        </section> : <>
          <section className="stats-metrics" aria-label="Souhrn úlovků">
            <StatCard label="Zaznamenané úlovky" value={formatNumber(stats.catchCount, 0)} />
            <StatCard label="Různé druhy" value={formatNumber(stats.speciesCount, 0)} />
            {stats.biggestWeightKg !== null && <StatCard label="Největší změřený" value={`${formatNumber(stats.biggestWeightKg)} kg`} note={`${formatCatchCount(stats.measuredWeightCount)} se známou váhou`} />}
            {stats.longestLengthCm !== null && <StatCard label="Nejdelší změřený" value={`${formatNumber(stats.longestLengthCm, 0)} cm`} note={`${formatCatchCount(stats.measuredLengthCount)} se známou délkou`} />}
            {outcomes && <StatCard label="Puštěno ze známých výsledků" value={`${outcomes.percentageReleased}%`} note={`${outcomes.released} z ${outcomes.known} úlovků se známým výsledkem`} />}
          </section>

          <section className="stats-panel stats-history" aria-label="Úlovky v čase">
            <div className="stats-panel-heading">
              <h2>Úlovky v čase</h2>
              <span>Posledních 6 měsíců</span>
            </div>
            {stats.datedCatchCount === 0 ? <p className="stats-panel-note">Časový přehled se zobrazí po doplnění data úlovku.</p> : <>
              <div className="stats-months">
                {stats.monthlyCatchCounts.map((month) => <div className="stats-month" key={month.key}>
                  <span className="stats-month-label">{month.label}</span>
                  <span className="stats-month-track"><span className="stats-month-bar" style={{ width: `${month.count ? Math.max(8, (month.count / Math.max(...stats.monthlyCatchCounts.map((item) => item.count))) * 100) : 0}%` }} /></span>
                  <strong>{month.count}</strong>
                </div>)}
              </div>
              <p className="stats-panel-note">Počty vycházejí z úlovků s platným datem; celkem takových záznamů: {stats.datedCatchCount}.</p>
            </>}
          </section>

          <div className="stats-rankings">
            <Ranking title="Nejčastější druhy" items={stats.species} />
            <Ranking title="Nejčastější metody" items={stats.methods} />
          </div>
        </>}

        <section className="stats-panel stats-trips">
          <h2>Výpravy</h2>
          {stats.completedTripsCount === 0 && stats.activeTripsCount === 0
            ? <p className="stats-panel-note">Dokončené výpravy se zobrazí po ukončení první výpravy.</p>
            : <div className="stats-trip-summary">
              <StatCard label="Dokončené výpravy" value={formatNumber(stats.completedTripsCount, 0)} />
              {stats.activeTripsCount > 0 && <StatCard label="Právě probíhá" value={formatNumber(stats.activeTripsCount, 0)} />}
              {stats.averageCatchesPerCompletedTrip !== null && <StatCard label="Úlovků na dokončenou výpravu" value={formatNumber(stats.averageCatchesPerCompletedTrip)} note="Počítají se jen úlovky přiřazené k dokončeným výpravám." />}
            </div>}
        </section>
      </>}
    </div>
  </Layout>;
}

export default StatsPage;
