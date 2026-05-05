import { useParams, useNavigate } from "react-router-dom";
import { useCatches } from "../context/CatchContext";
import Layout from "../components/Layout";
import "../styles/SpeciesDetailPage.css";
import CatchCard from "../components/CatchCard";

function SpeciesDetailPage() {
  const { speciesKey } = useParams();
  const { state } = useCatches();
  const selectedSpecies = state.catches.filter((item) => {
    return item.speciesKey === speciesKey;
  });
  const biggest = selectedSpecies.reduce((a, b) => {
    return a.weightKg > b.weightKg ? a : b;
  });
  const navigate = useNavigate();
  return (
    <Layout>
      <div className="species-hero">
        <div className="species-hero-fish">🐟</div>
        <div className="species-hero-nav">
          <button className="species-hero-back" onClick={() => navigate(-1)}>
            ←
          </button>
          <div className="species-hero-actions">
            <button className="ib">⭐</button>
            <button className="ib">✏️</button>
          </div>
        </div>

        <p className="species-latin">{biggest.speciesLatin}</p>
        <h1>{biggest.species}</h1>
        <div className="tags">
          {biggest.isPersonalBest && (
            <span className="tag tag-pb">🏆 Osobní rekord</span>
          )}
          <span className="tag tag-species">🥇 Rekord druhu</span>
          {biggest.result === "released" && (
            <span className="tag tag-released">↩️ Puštěno</span>
          )}
          {biggest.result === "kept" && (
            <span className="tag tag-kept">🧊 Necháno</span>
          )}
        </div>

        <div className="species-measures">
          <div className="species-measure">
            <span>{biggest.weightKg}</span>
            <div className="species-measure-unit">kg</div>
            <div className="species-measure-label">Hmotnost</div>
          </div>
          <div className="species-measure">
            <span>{biggest.lengthCm}</span>
            <div className="species-measure-unit">cm</div>
            <div className="species-measure-label">Délka</div>
          </div>
          <div className="species-measure">
            <span>{biggest.fightMinutes ?? "—"}</span>
            <div className="species-measure-unit">min</div>
            <div className="species-measure-label">Boj</div>
          </div>
        </div>
      </div>

      <div className="species-catches-header">
        <span className="species-catches-title">
          Všechny úlovky · {selectedSpecies.length}
        </span>
      </div>

      {selectedSpecies.map((item) => (
        <CatchCard key={item.id} catchedFish={item} />
      ))}
    </Layout>
  );
}

export default SpeciesDetailPage;
