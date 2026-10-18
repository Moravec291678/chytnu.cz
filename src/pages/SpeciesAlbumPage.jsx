import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { buildSpeciesAlbum } from "../features/species/data/speciesAlbum";
import { DEFAULT_SPECIES } from "../shared/constants/constants";
import "./SpeciesAlbumPage.css";

function measurement(value, unit) {
  return Number.isFinite(value) ? `${value} ${unit}` : "Neuvedeno";
}

function SpeciesAlbumPage() {
  const { state } = useCatches();
  const album = buildSpeciesAlbum(state.catches, DEFAULT_SPECIES);
  const discovered = album.filter((item) => item.discovered).length;
  return <Layout><div className="album-page">
    <header className="album-header"><Link to="/profile">← Profil</Link><h1>Druhové album</h1><p>{discovered} z {album.length} druhů v osobním deníku</p></header>
    {state.loading ? <p>Načítám album…</p> : <div className="album-grid">{album.map((species) => species.discovered
      ? <Link className="album-card album-card--discovered" to={`/species/${species.key}`} key={species.key}>
        <span className="album-fish" aria-hidden="true">🐟</span><strong>{species.label}</strong><small>{species.latinName}</small>
        <span>{species.catchCount}× zaznamenáno</span><span>Rekord: {measurement(species.bestWeightKg, "kg")} · {measurement(species.bestLengthCm, "cm")}</span>
      </Link>
      : <article className="album-card album-card--locked" key={species.key}><span className="album-fish" aria-hidden="true">○</span><strong>{species.label}</strong><small>{species.latinName}</small><span>Zatím bez úlovku</span></article>)}</div>}
  </div></Layout>;
}

export default SpeciesAlbumPage;
