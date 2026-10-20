import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { buildYearSummary } from "../features/retrospectives/data/retrospectives.js";

export default function YearSummaryPage() {
  const { state: catchState } = useCatches(); const { state: tripState } = useTrips();
  const years = useMemo(() => [...new Set(catchState.catches.map((r) => Date.parse(r.caughtAt)).filter(Number.isFinite).map((time) => new Date(time).getFullYear()))].sort((a, b) => b - a), [catchState.catches]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const summary = buildYearSummary(catchState.catches, tripState.trips, year);
  const show = (value) => value || "Nedostatek dat";
  return <Layout><section className="add-catch-section"><Link to="/profile">← Profil</Link><h1>Roční souhrn</h1>
    <label>Rok<select value={year} onChange={(event) => setYear(Number(event.target.value))}>{[...new Set([new Date().getFullYear(), ...years])].sort((a, b) => b - a).map((item) => <option key={item}>{item}</option>)}</select></label>
    {catchState.loading || tripState.loading ? <p role="status">Načítám deník…</p> : summary.catches === 0 ? <p>Pro rok {year} zatím nemáš žádné úlovky.</p> : <ul>
      <li>Úlovky: {summary.catches}</li><li>Výpravy: {summary.trips}</li><li>Druhy: {summary.species}</li>
      <li>Největší úlovek: {show(summary.biggest ? `${summary.biggest.species || "Ryba"}, ${summary.biggest.weightKg} kg` : null)}</li>
      <li>Nejdelší úlovek: {show(summary.longest ? `${summary.longest.species || "Ryba"}, ${summary.longest.lengthCm} cm` : null)}</li>
      <li>Nejlepší měsíc: {show(summary.bestMonth?.label)}</li><li>Nejčastější metoda: {show(summary.bestMethod?.label)}</li><li>Nejčastější nástraha: {show(summary.bestBait?.label)}</li>
      <li>Osobní rekordy podle dostupných měření: hmotnost {summary.recordsWithWeight}, délka {summary.recordsWithLength}</li>
    </ul>}
    {catchState.error && <p role="alert">{catchState.error}</p>}<p><Link to="/insights">Osobní přehledy →</Link></p>
  </section></Layout>;
}
