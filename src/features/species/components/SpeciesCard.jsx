import { Link } from "react-router-dom";
import { Badge, Card } from "../../../shared/components/UIPrimitives.jsx";
import { MOON_PHASE_EMOJI } from "../../../shared/constants/constants";
import {
  formatCatchDateTime,
  formatFightDuration,
} from "../../../shared/utils/formatters";

import "./SpeciesCard.css";

function SpeciesCard({ speciesKey, data, biggest }) {
  return (
    <Link className="species-card-link" to={`/species/${speciesKey}`}>
      <Card density="comfortable" interactive className="species-card">
        <div className="species-card-main">
          <div className="species-card-icon">🐟</div>

          <div className="species-card-info">
            <h2>{biggest.species}</h2>

            {(biggest.locationName || biggest.method?.label) && <p>📍 {biggest.locationName || "Lokalita neuvedena"}{biggest.method?.label ? ` · 🎣 ${biggest.method.label}` : ""}</p>}

            <div className="tags">
              {biggest.isPersonalBest && (
                <Badge tone="record">🏆 Osobní rekord</Badge>
              )}

              {biggest.isSpeciesBest && (
                <Badge tone="species">🥇 Rekord druhu</Badge>
              )}

              {biggest.result === "released" && (
                <Badge tone="released">↩️ Puštěno</Badge>
              )}

              {biggest.result === "kept" && (
                <Badge tone="kept">🧊 Necháno</Badge>
              )}
            </div>
          </div>

          <div className="species-card-right">
            {biggest.lengthCm != null && <p>{biggest.lengthCm} cm</p>}

            {biggest.weightKg != null && <p>{biggest.weightKg} kg</p>}

            <p>{data.count}x</p>
          </div>
        </div>

        <div className="species-card-footer">
          <p>🕒 {formatCatchDateTime(biggest.caughtAt)}</p>

          {biggest.fightMinutes != null && <p>⏱️ {formatFightDuration(biggest.fightMinutes)}</p>}

          <p>{MOON_PHASE_EMOJI[biggest.conditions?.moonPhase] || "-"}</p>
        </div>
      </Card>
    </Link>
  );
}

export default SpeciesCard;
