import { useParams, useNavigate } from "react-router-dom";
import { useCatches } from "../features/catches/context/useCatches";
import Layout from "../shared/layout/Layout";
import CatchCard from "../features/catches/components/CatchCard";
import { Link } from "react-router-dom";
import "./SpeciesDetailPage.css";

function SpeciesDetailPage() {
  const { speciesKey } = useParams();
  const { state } = useCatches();
  const selectedSpecies = state.catches.filter((item) => {
    return item.speciesKey === speciesKey;
  });
  const biggest = selectedSpecies.filter((item) => Number.isFinite(item.weightKg)).reduce((a, b) => a.weightKg > b.weightKg ? a : b, selectedSpecies[0]);
  const navigate = useNavigate();
  if (!biggest) return <Layout><div className="species-hero"><button className="species-hero-back" onClick={() => navigate(-1)}>←</button><h1>Druh zatím nemá úlovky</h1><Link to="/add">Přidat úlovek</Link></div></Layout>;
  return (
    <Layout>
      <div className="species-hero">
        <div className="species-hero-fish">🐟</div>
        <div className="species-hero-nav">
          <button className="species-hero-back" onClick={() => navigate(-1)}>
            ←
          </button>
        </div>

        <p className="species-latin">{biggest.speciesLatin}</p>
        <h1>{biggest.species}</h1>
        <div className="tags">
          {biggest.isPersonalBest && (
            <span className="tag tag-pb">🏆 Osobní rekord</span>
          )}
          {Number.isFinite(biggest.weightKg) && <span className="tag tag-species">Nejtěžší zaznamenaný úlovek</span>}
          {biggest.result === "released" && (
            <span className="tag tag-released">↩️ Puštěno</span>
          )}
          {biggest.result === "kept" && (
            <span className="tag tag-kept">🧊 Necháno</span>
          )}
        </div>

        <div className="species-measures">
          <div className="species-measure">
            <span>{biggest.weightKg ?? "—"}</span>
            <div className="species-measure-unit">kg</div>
            <div className="species-measure-label">Hmotnost</div>
          </div>
          <div className="species-measure">
            <span>{biggest.lengthCm ?? "—"}</span>
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
