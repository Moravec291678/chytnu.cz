import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCatches } from "../features/catches/context/useCatches";
import Layout from "../shared/layout/Layout";
import CatchCard from "../features/catches/components/CatchCard";
import { Link } from "react-router-dom";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import { getSpeciesDetail } from "../features/species/data/speciesDetail.js";
import { DEFAULT_SPECIES } from "../shared/constants/constants";
import "./SpeciesDetailPage.css";

function SpeciesDetailPage() {
  const { speciesKey } = useParams();
  const { state, toggleFavorite } = useCatches();
  const [favoriteError, setFavoriteError] = useState("");
  const [savingFavorite, setSavingFavorite] = useState(false);
  const savingFavoriteRef = useRef(false);
  const { catches: selectedSpecies, biggestCatch: bestWeightCatch, longestCatch: bestLengthCatch, personalRecord } =
    getSpeciesDetail(state.catches, speciesKey);
  const species = DEFAULT_SPECIES.find((item) => item.key === speciesKey);
  const ledger = useProgression();
  const mastery = ledger.summary.mastery.find((item) => item.speciesKey === speciesKey);
  const navigate = useNavigate();
  const handleToggleFavorite = async () => {
    if (!bestWeightCatch || savingFavoriteRef.current) return;
    savingFavoriteRef.current = true;
    setSavingFavorite(true);
    setFavoriteError("");
    try {
      await toggleFavorite(bestWeightCatch.id);
    } catch (error) {
      setFavoriteError(error.message || "Oblíbený stav se nepodařilo uložit.");
    } finally {
      savingFavoriteRef.current = false;
      setSavingFavorite(false);
    }
  };
  if (state.loading || ledger.loading) return <Layout><div className="species-detail-page"><p className="loading-state" role="status">Načítám úlovky tohoto druhu…</p></div></Layout>;
  if (state.error || ledger.error) return <Layout><div className="species-detail-page"><p className="species-detail-error" role="alert">{state.error || ledger.error}</p><Link className="species-hero-back" to="/album">← Zpět do alba</Link></div></Layout>;
  if (!selectedSpecies.length && !mastery) return <Layout><div className="species-detail-page"><Link className="species-hero-back" to="/album">← Album druhů</Link><h1>Tento druh zatím nemá úlovky</h1><p>Zaznamenané úlovky se zobrazí v přehledu druhu.</p><Link className="species-add-link" to="/add">Zapsat úlovek</Link></div></Layout>;
  return (
    <Layout>
      <div className="species-detail-page">
      <div className="species-hero">
        <div className="species-hero-nav">
          <button type="button" className="species-hero-back" aria-label="Zpět" onClick={() => navigate(-1)}>
            ←
          </button>
          {bestWeightCatch && (
            <div className="species-hero-actions">
              <button
                className={bestWeightCatch.isFavorite ? "species-hero-action species-hero-action-active" : "species-hero-action"}
                type="button"
                aria-label={bestWeightCatch.isFavorite ? "Odebrat největší úlovek z oblíbených" : "Přidat největší úlovek mezi oblíbené"}
                aria-pressed={Boolean(bestWeightCatch.isFavorite)}
                disabled={savingFavorite}
                onClick={handleToggleFavorite}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.3-.9L12 3Z" /></svg>
              </button>
              <Link className="species-hero-action" to={`/catch/${bestWeightCatch.id}/edit`} aria-label="Upravit největší úlovek">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.2-.9L19 8.3 15.7 5 4.9 15.8 4 20Z" /></svg>
              </Link>
            </div>
          )}
        </div>

        {favoriteError && <p className="species-favorite-error" role="alert">{favoriteError}</p>}
        {(species?.latinName || selectedSpecies[0]?.speciesLatin) && <p className="species-latin">{species?.latinName || selectedSpecies[0]?.speciesLatin}</p>}
        <h1>{species?.label || selectedSpecies[0]?.species || "Druh"}</h1>
        {mastery && <Link className="species-mastery-link" to={`/species/${speciesKey}/mastery`}>{mastery.level} z 5 hvězd · Mastery druhu →</Link>}
        <div className="tags">
          {bestWeightCatch && <span className="species-detail-badge">Rekord druhu</span>}
          {bestWeightCatch?.id === personalRecord?.id && <span className="species-detail-badge species-detail-badge-record">Osobní rekord</span>}
          {bestWeightCatch?.isFavorite && <span className="species-detail-badge">Oblíbený</span>}
          {bestWeightCatch?.result === "released" && <span className="species-detail-badge species-detail-badge-positive">Puštěno</span>}
          {bestWeightCatch?.result === "kept" && <span className="species-detail-badge species-detail-badge-danger">Ponecháno</span>}
        </div>

        <div className="species-measures">
          <div className="species-measure">
            <span>{bestWeightCatch ? bestWeightCatch.weightKg.toLocaleString("cs-CZ", { maximumFractionDigits: 2 }) : "—"}</span>
            {bestWeightCatch && <div className="species-measure-unit">kg</div>}
            <div className="species-measure-label">Největší váha</div>
          </div>
          <div className="species-measure">
            <span>{bestLengthCatch ? bestLengthCatch.lengthCm.toLocaleString("cs-CZ", { maximumFractionDigits: 1 }) : "—"}</span>
            {bestLengthCatch && <div className="species-measure-unit">cm</div>}
            <div className="species-measure-label">Největší délka</div>
          </div>
          <div className="species-measure">
            <span>{selectedSpecies.length}</span>
            <div className="species-measure-label">Úlovků</div>
          </div>
        </div>
      </div>

      <div className="species-catches-header">
        <span className="species-catches-title">
          Všechny úlovky · {selectedSpecies.length}
        </span>
      </div>

      {selectedSpecies.map((item) => (
        <CatchCard key={item.id} catchedFish={item} isPersonalRecord={item.id === personalRecord?.id} />
      ))}
      </div>
    </Layout>
  );
}

export default SpeciesDetailPage;
