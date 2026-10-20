import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { buildYearSummary, getAvailableSummaryYears } from "../features/retrospectives/data/retrospectives.js";
import { getPragueDateParts } from "../features/stats/utils/statsPeriod.js";
import { formatCatchWeight } from "../features/catches/data/catchWeight.js";
import "./YearSummaryPage.css";

const EMPTY_ROWS = Object.freeze([]);

function SummaryCard({ value, label, tone = "green", note = "" }) {
  return <article className={`year-summary-card year-summary-card-${tone}`}>
    <strong>{value}</strong>
    <span>{label}</span>
    {note && <small>{note}</small>}
  </article>;
}

export default function YearSummaryPage() {
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();
  const catches = catchState.catches ?? EMPTY_ROWS;
  const trips = tripState.trips ?? EMPTY_ROWS;
  const currentYear = getPragueDateParts(new Date()).year;
  const years = useMemo(() => getAvailableSummaryYears(catches, trips, currentYear), [catches, trips, currentYear]);
  const [year, setYear] = useState(currentYear);
  const summary = buildYearSummary(catches, trips, year);
  const largest = summary.largestRecordedCatch;
  const largestWeight = formatCatchWeight(largest);
  const loading = catchState.loading || tripState.loading;
  const hasError = Boolean(catchState.error || tripState.error);

  return <Layout>
    <main className="year-summary-page">
      <header className="year-summary-header">
        <Link to="/profile">← Profil</Link>
        <h1>Tvůj rok {year}</h1>
        <p>Roční přehled podle uložených výprav a úlovků.</p>
      </header>

      <label className="year-summary-select-label">
        Zvolený rok
        <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {years.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>

      {loading ? <p className="year-summary-state" role="status">Načítám deník…</p>
        : hasError ? <section className="year-summary-state" role="alert">
          <h2>Roční přehled není úplný</h2>
          {catchState.error && <p>{catchState.error}</p>}
          {tripState.error && <p>{tripState.error}</p>}
        </section>
          : summary.catches === 0 && summary.trips === 0
            ? <section className="year-summary-empty">
              <h2>Rok {year} zatím nemá žádné záznamy</h2>
              <p>Výpravy a úlovky se v ročním přehledu objeví po uložení do deníku.</p>
            </section>
            : <>
              <section className="year-summary-cards" aria-label={`Souhrn roku ${year}`}>
                <SummaryCard value={summary.trips.toLocaleString("cs-CZ")} label="výletů" />
                <SummaryCard value={summary.catches.toLocaleString("cs-CZ")} label="úlovků" />
                <SummaryCard
                  value={largestWeight ? `${largestWeight} kg` : "—"}
                  label="největší ryba"
                  tone="gold"
                  note={largest?.weightSource === "estimated" ? `${largest.species || "Ryba"} · hmotnost je odhad` : largest?.species || "Zvážená hmotnost není uvedena"}
                />
                <SummaryCard value={summary.bestMonth?.label || "—"} label="nejlepší měsíc" />
                <SummaryCard value={summary.bestBait?.label || "—"} label="nejlepší nástraha" />
              </section>
              {summary.catches === 0 && <p className="year-summary-no-catches">V tomto roce zatím nejsou úlovky. Zobrazený počet výprav vychází ze skutečných záznamů Trip.</p>}
            </>}

      <nav className="year-summary-links" aria-label="Další roční přehledy">
        <Link to="/insights">Tipy a postřehy →</Link>
      </nav>
    </main>
  </Layout>;
}
