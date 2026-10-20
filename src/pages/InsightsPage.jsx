import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { buildInsights } from "../features/retrospectives/data/retrospectives.js";

export default function InsightsPage() {
  const { state } = useCatches();
  const insights = buildInsights(state.catches);
  return <Layout><section className="add-catch-section"><Link to="/profile">← Profil</Link><h1>Osobní přehledy</h1>
    <p>Vzorce počítané z místních záznamů ({state.catches.length} úlovků). Každý závěr potřebuje alespoň tři záznamy.</p>
    {state.loading ? <p role="status">Načítám úlovky…</p> : <ul>{insights.map((item) => <li key={item.key}><strong>{item.label}:</strong> {item.value ? `${item.value} (${item.count}×)` : "Nedostatek dat"}</li>)}</ul>}
    {state.error && <p role="alert">{state.error}</p>}<p><Link to="/stats">Podrobné statistiky →</Link></p><p><Link to="/season-story">Příběh sezóny →</Link></p><p><Link to="/year-summary">Roční souhrn →</Link></p>
  </section></Layout>;
}
