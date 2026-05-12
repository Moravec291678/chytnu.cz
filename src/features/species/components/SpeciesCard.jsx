import { Link } from "react-router-dom";
import { MOON_PHASE_EMOJI } from "../../../shared/constants/constants";
import {
  formatCatchDateTime,
  formatFightDuration,
} from "../../../shared/utils/formatters";
import "./SpeciesCard.css";

function SpeciesCard({ speciesKey, data, biggest }) {
  return (
    <Link className="species-card-link" to={`/species/${speciesKey}`}>
      <div className="species-card">
        <div className="species-card-main">
          <div className="species-card-icon">đźź</div>
          <div className="species-card-info">
            <h2>{biggest.species}</h2>
            <p>
              đź“Ť {biggest.locationName} Â· đźŽŁ {biggest.method?.label}
            </p>
            <div className="tags">
              {biggest.isPersonalBest && (
                <span className="tag tag-pb">đźŹ† OsobnĂ­ rekord</span>
              )}
              {biggest.isSpeciesBest && (
                <span className="tag tag-species">đźĄ‡ Rekord druhu</span>
              )}
              {biggest.result === "released" && (
                <span className="tag tag-released">â†©ď¸Ź PuĹˇtÄ›no</span>
              )}
              {biggest.result === "kept" && (
                <span className="tag tag-kept">đź§Š NechĂˇno</span>
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
          <p>đź“… {formatCatchDateTime(biggest.caughtAt)}</p>
          <p>âŹ±ď¸Ź {formatFightDuration(biggest.fightMinutes)}</p>
          <p>{MOON_PHASE_EMOJI[biggest.conditions?.moonPhase] || "-"}</p>
        </div>
      </div>
    </Link>
  );
}

export default SpeciesCard;
