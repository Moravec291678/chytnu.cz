import { MOON_PHASE_EMOJI } from "../utils/constants";
import { Link } from "react-router-dom";
import "../styles/SpeciesCard.css";
function SpeciesCard({ speciesKey, data, biggest }) {
  return (
    <Link className="species-card-link" to={`/species/${speciesKey}`}>
      <div className="species-card">
        <div className="species-card-main">
          <div className="species-card-icon">🐟</div>
          <div className="species-card-info">
            <h2>{biggest.species}</h2>
            <p>
              📍{biggest.locationName} · 🎣{biggest.method?.label}
            </p>
            <div className="tags">
              {biggest.isPersonalBest && (
                <span className="tag tag-pb">🏆 Osobní rekord</span>
              )}
              {biggest.isSpeciesBest && (
                <span className="tag tag-species">🥇 Rekord druhu</span>
              )}
              {biggest.result === "released" && (
                <span className="tag tag-released">↩️ Puštěno</span>
              )}
              {biggest.result === "kept" && (
                <span className="tag tag-kept">🧊 Necháno</span>
              )}
            </div>
          </div>
          <div className="species-card-right">
            <p>{biggest.weightKg} kg</p>
            <p>{biggest.lengthCm} cm</p>
            <p>{data.count}x</p>
          </div>
        </div>
        <div className="species-card-footer">
          <p>
            📅{" "}
            {biggest.caughtAt.toLocaleDateString("cs-CZ", {
              day: "numeric",
              month: "numeric",
            })}{" "}
            ·{" "}
            {biggest.caughtAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </p>
          <p>⏱️ {biggest.fightMinutes ? `${biggest.fightMinutes} min` : "-"}</p>
          <p>{MOON_PHASE_EMOJI[biggest.conditions?.moonPhase] || "-"}</p>
        </div>
      </div>
    </Link>
  );
}

export default SpeciesCard;
