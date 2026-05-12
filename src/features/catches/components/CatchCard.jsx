import { Link } from "react-router-dom";
import { MOON_PHASE_EMOJI } from "../../../shared/constants/constants";

import {
  formatCatchDateTime,
  formatFightDuration,
} from "../../../shared/utils/formatters";

import "./CatchCard.css";

function CatchCard({ catchedFish }) {
  return (
    <Link to={`/catch/${catchedFish.id}`} className="catch-card-link">
      <div className="catch-card">
        <div className="catch-card-main">
          <div className="catch-card-icon">🐟</div>

          <div className="catch-card-info">
            <h2>{catchedFish.species}</h2>

            <p>
              📍 {catchedFish.locationName} · 🎣 {catchedFish.method.label}
            </p>

            <div className="tags">
              {catchedFish.isPersonalBest && (
                <span className="tag tag-pb">🏆 Osobní rekord</span>
              )}

              {catchedFish.isSpeciesBest && (
                <span className="tag tag-species">🥇 Rekord druhu</span>
              )}

              {catchedFish.result === "released" && (
                <span className="tag tag-released">↩️ Puštěno</span>
              )}

              {catchedFish.result === "kept" && (
                <span className="tag tag-kept">🧊 Necháno</span>
              )}
            </div>
          </div>

          <div className="catch-card-right">
            <p>{catchedFish.weightKg} kg</p>

            <p>{catchedFish.lengthCm} cm</p>
          </div>
        </div>

        <div className="catch-card-footer">
          <p>🕒 {formatCatchDateTime(catchedFish.caughtAt)}</p>

          <p>⏱️ {formatFightDuration(catchedFish.fightMinutes)}</p>

          <p>{MOON_PHASE_EMOJI[catchedFish.conditions?.moonPhase] || "-"}</p>
        </div>
      </div>
    </Link>
  );
}

export default CatchCard;
