import { useState } from "react";
import Layout from "../shared/layout/Layout";
import CatchCard from "../features/catches/components/CatchCard";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { getCatchOutcomeStats } from "../features/home/utils/profileStats";
import { getCatchPatterns, getCatchStatistics } from "../features/stats/utils/catchStatistics";
import { getMonthlyCatchSeries, getPeriodLabel, getPeriodRange } from "../features/stats/utils/statsPeriod.js";
import { getBiggestCatch } from "../features/home/utils/profileStats";
import { formatCatchMeasurements } from "../features/catches/data/catchWeight.js";
import { isFeatureEnabled } from "../shared/config/featureFlags.js";
import { getEntitlementState } from "../features/entitlements/data/entitlementAccess.js";
import "./StatsPage.css";

const PERIODS = [
  ["season", "Sezóna"],
  ["year", "Rok"],
  ["total", "Celkem"],
];

function filterByPeriod(records, period, now, dateField) {
  const range = getPeriodRange(period, now);
  if (!range) return records;
  const [start, end] = range;
  return records.filter((record) => {
    const timestamp = Date.parse(record[dateField]);
    return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp < end.getTime();
  });
}

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

function SpeciesRanking({ items }) {
  if (!items.length) return null;
  const maxCount = items[0].count;
  return <section className="stats-panel stats-species" aria-label="Počty podle druhu">
    <div className="stats-panel-heading"><h2>Druhy ryb</h2><span>{items.length} zaznamenáno</span></div>
    <ul className="stats-species-list">
      {items.map((item) => <li className="stats-species-row" key={item.key}>
        <span className="stats-species-name">{item.label}</span>
        <span className="stats-species-track" aria-hidden="true"><span style={{ width: `${(item.count / maxCount) * 100}%` }} /></span>
        <strong>{item.count}</strong>
      </li>)}
    </ul>
  </section>;
}

function StatsPage() {
  const { state: catchState, refresh: refreshCatches } = useCatches();
  const { state: tripState, refresh: refreshTrips } = useTrips();
  const [period, setPeriod] = useState("season");
  const now = new Date();
  const periodCatches = filterByPeriod(catchState.catches, period, now, "caughtAt");
  const periodTrips = filterByPeriod(tripState.trips, period, now, "startedAt");
  const stats = getCatchStatistics(periodCatches, periodTrips, now);
  const monthlySeries = getMonthlyCatchSeries(periodCatches, period, now);
  const maxMonthlyCatchCount = Math.max(1, ...monthlySeries.months.map((month) => month.count));
  const patterns = getCatchPatterns(periodCatches);
  const outcomes = getCatchOutcomeStats(periodCatches);
  const recordCatch = getBiggestCatch(periodCatches);
  const allTimeRecord = getBiggestCatch(catchState.catches);
  const loading = catchState.loading || tripState.loading;
  const hasError = Boolean(catchState.error || tripState.error);
  const patternItems = [
    patterns.time && { label: "Čas úlovku", value: patterns.time.labels.join(" · "), note: `${patterns.time.count}× z ${patterns.time.sampleCount}` },
    patterns.location && { label: "Místo", value: patterns.location.labels.join(" · "), note: `${patterns.location.count}× z ${patterns.location.sampleCount}` },
    patterns.bait && { label: "Nástraha", value: patterns.bait.labels.join(" · "), note: `${patterns.bait.count}× z ${patterns.bait.sampleCount}` },
    patterns.month && { label: "Měsíc", value: patterns.month.labels.join(" · "), note: `${patterns.month.count}× z ${patterns.month.sampleCount}` },
    patterns.pressureHpa && { label: "Průměrný tlak", value: `${formatNumber(patterns.pressureHpa.value, 0)} hPa`, note: `${patterns.pressureHpa.sampleCount} měření` },
    patterns.waterTemperatureC && { label: "Teplota vody", value: `${formatNumber(patterns.waterTemperatureC.value)} °C`, note: `${patterns.waterTemperatureC.sampleCount} měření` },
  ].filter(Boolean);

  return <Layout>
    <div className="stats-page">
      <header className="stats-header">
        <h1>Statistiky</h1>
        <p>{getPeriodLabel(period, now)} · podle tvých uložených záznamů</p>
      </header>

      <div className="stats-period" role="group" aria-label="Období statistik">
        {PERIODS.map(([key, label]) => <button
          type="button"
          key={key}
          className={period === key ? "stats-period-button stats-period-button-active" : "stats-period-button"}
          aria-pressed={period === key}
          onClick={() => setPeriod(key)}
        >{label}</button>)}
      </div>

      {hasError && <div className="stats-error" role="alert">
        <p>{[catchState.error, tripState.error].filter(Boolean).join(" ")}</p>
        {catchState.error && <button type="button" onClick={refreshCatches}>Načíst úlovky znovu</button>}
        {tripState.error && <button type="button" onClick={refreshTrips}>Načíst vycházky znovu</button>}
      </div>}

      {loading ? <p className="stats-status loading-state" role="status">Načítám místní statistiky…</p> : hasError
        ? <section className="stats-empty stats-data-unavailable">
          <h2>Statistiky nejsou úplné</h2>
          <p>Po obnovení místních dat se zobrazí souhrny úlovků i vycházek.</p>
        </section>
        : <>
        {patternItems.length > 0 && <section className="stats-panel stats-patterns">
          <div className="stats-panel-heading"><h2>Nejčastěji zaznamenané podmínky</h2><span>{formatCatchCount(periodCatches.length)} v období</span></div>
          <p className="stats-panel-note">Popis četností z tvých záznamů; nejde o předpověď ani doporučení.</p>
          <p className="stats-pattern-threshold">Vzorce se zobrazí až při alespoň 3 skutečných záznamech a opakování stejné hodnoty.</p>
          <div className="stats-pattern-grid">{patternItems.map((item) => <article className="stats-pattern" key={item.label}>
            <span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small>
          </article>)}</div>
        </section>}
        {stats.catchCount === 0 ? <section className="stats-empty">
          <h2>{catchState.catches.length === 0 ? "Historie začíná prvním úlovkem" : "V tomto období zatím nejsou úlovky"}</h2>
          <p>{catchState.catches.length === 0
            ? "Jakmile uložíš úlovek, najdeš tu přehled druhů, měření a vývoje v čase. Záznam přidáš tlačítkem + dole."
            : "Zkus vybrat jiné období nebo se vrať, až přibudou nové záznamy."}</p>
        </section> : <>
          <section className="stats-metrics" aria-label="Souhrn úlovků">
            <StatCard label="Zaznamenané úlovky" value={formatNumber(stats.catchCount, 0)} />
            <StatCard label="Různé druhy" value={formatNumber(stats.speciesCount, 0)} />
            {stats.longestLengthCm !== null && <StatCard label="Nejdelší změřený" value={`${formatNumber(stats.longestLengthCm, 0)} cm`} note={`${formatCatchCount(stats.measuredLengthCount)} se známou délkou`} />}
            {recordCatch && <StatCard label="Nejlepší úlovek za období" value={formatCatchMeasurements(recordCatch)} note={recordCatch.species} />}
            {allTimeRecord && <StatCard label="Osobní rekord" value={formatCatchMeasurements(allTimeRecord)} note={allTimeRecord.species} />}
            {patterns.time && <StatCard label="Nejlepší čas" value={patterns.time.labels.join(" · ")} note={`${patterns.time.count}× z ${patterns.time.sampleCount} záznamů`} />}
            {patterns.bait && <StatCard label="Nejlepší nástraha" value={patterns.bait.labels.join(" · ")} note={`${patterns.bait.count}× z ${patterns.bait.sampleCount} záznamů`} />}
            {stats.species[0] && <StatCard label="Nejčastější druh" value={stats.species[0].label} note={`${stats.species[0].count}× v tomto období`} />}
            {outcomes && <StatCard label="Puštěno ze známých výsledků" value={`${outcomes.percentageReleased}%`} note={`${outcomes.released} z ${outcomes.known} úlovků se známým výsledkem`} />}
          </section>

          <section className="stats-panel stats-history" aria-label="Úlovky v čase">
            <div className="stats-panel-heading">
              <h2>Úlovky v čase</h2>
              <span>{period === "total" ? "Posledních 6 měsíců" : period === "year" ? "Měsíce v roce" : "Měsíce sezóny"}</span>
            </div>
            {monthlySeries.datedCatchCount === 0 ? <p className="stats-panel-note">Časový přehled se zobrazí po doplnění data úlovku.</p> : <>
              <div className="stats-months" style={{ "--stats-month-count": monthlySeries.months.length }}>
                {monthlySeries.months.map((month) => <div className="stats-month" key={month.key}>
                  <strong>{month.count}</strong>
                  <span className="stats-month-label">{month.label}</span>
                  <span className="stats-month-track"><span className="stats-month-bar" style={{ height: `${month.count ? Math.max(8, (month.count / maxMonthlyCatchCount) * 100) : 0}%` }} /></span>
                </div>)}
              </div>
              <p className="stats-panel-note">V grafu je {formatCatchCount(monthlySeries.datedCatchCount)} s platným datem v tomto časovém okně.</p>
            </>}
          </section>

          <div className="stats-rankings">
            <Ranking title="Nejčastější metody" items={stats.methods} />
          </div>
          <SpeciesRanking items={stats.species} />
          <section className="stats-panel stats-top-catches">
            <h2>Nejtěžší úlovky</h2>
            {periodCatches.filter((item) => Number.isFinite(item.weightKg)).length
              ? [...periodCatches].filter((item) => Number.isFinite(item.weightKg)).sort((a, b) => b.weightKg - a.weightKg).slice(0, 5).map((item) => <CatchCard key={item.id} catchedFish={item} isPersonalRecord={item.id === allTimeRecord?.id} />)
              : <p className="stats-panel-note">Úlovky s uvedenou hmotností se zobrazí zde.</p>}
          </section>
        </>}

        <section className="stats-panel stats-unavailable" aria-label="Doporučení na příštích 48 hodin">
          <h2>Doporučení na 48 hodin</h2>
          <p className="stats-panel-note">{isFeatureEnabled("aiInsights")
            ? "Doporučení se zobrazí, až budou dostupné ověřené podmínky a výpočty pro tvá data."
            : "Tato funkce zatím není dostupná. Zobrazené statistiky vycházejí pouze z tvých uložených záznamů."}</p>
        </section>

        {getEntitlementState(null, "supporter") !== "active" && <section className="stats-supporter" aria-label="Rybářský příběh sezóny">
          <span>SUPPORTER</span>
          <h2>Rybářský příběh sezóny</h2>
          <p>Tato funkce zatím není dostupná.</p>
        </section>}

        <section className="stats-panel stats-trips">
          <h2>Vycházky</h2>
          {stats.completedTripsCount === 0 && stats.activeTripsCount === 0
            ? <p className="stats-panel-note">Dokončené vycházky se zobrazí po ukončení první vycházky.</p>
            : <div className="stats-trip-summary">
              <StatCard label="Dokončené vycházky" value={formatNumber(stats.completedTripsCount, 0)} />
              {stats.activeTripsCount > 0 && <StatCard label="Právě probíhá" value={formatNumber(stats.activeTripsCount, 0)} />}
              {stats.averageCatchesPerCompletedTrip !== null && <StatCard label="Úlovků na dokončenou vycházku" value={formatNumber(stats.averageCatchesPerCompletedTrip)} note="Počítají se jen úlovky přiřazené k dokončeným vycházkám." />}
            </div>}
        </section>
      </>}
    </div>
  </Layout>;
}

export default StatsPage;
