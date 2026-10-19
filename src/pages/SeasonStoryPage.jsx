import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { buildSeasonStory } from "../features/retrospectives/data/retrospectives.js";

export default function SeasonStoryPage() {
  const { state: catchState } = useCatches(); const { state: tripState } = useTrips();
  const year = new Date().getFullYear(); const story = buildSeasonStory(catchState.catches, tripState.trips, year);
  return <Layout><section className="add-catch-section"><Link to="/profile">← Profil</Link><h1>Příběh sezóny {year}</h1>
    {catchState.loading || tripState.loading ? <p role="status">Načítám místní deník…</p> : !story.catches ? <p>Sezóna zatím nemá žádné zapsané úlovky. Až přidáš záznamy, sestavím přehled z tvých dat.</p> : <>
      <p>V této sezóně máš {story.catches} {story.catches === 1 ? "úlovek" : "úlovků"} a zaznamenal/a jsi {story.speciesCount} druhů na {story.waterCount} vodách.</p>
      {story.biggest && <p>Nejtěžší zaznamenaný úlovek: {story.biggest.species || "Ryba"}, {story.biggest.weightKg} kg.</p>}
      {story.bestMonth && <p>Nejvíce záznamů připadá na měsíc {story.bestMonth.label} ({story.bestMonth.count}).</p>}
      <p>Výpravy v sezoně: {story.trips}.</p>
    </>}{catchState.error && <p role="alert">{catchState.error}</p>}<p><Link to="/year-summary">Roční souhrn →</Link></p>
  </section></Layout>;
}
