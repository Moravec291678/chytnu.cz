import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  formatCatchDateTime,
  formatFightDuration,
} from "../../../shared/utils/formatters";

import "./CatchCard.css";

function CatchPhoto({ blob, species }) {
  const [photoUrl, setPhotoUrl] = useState("");
  useEffect(() => {
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    let active = true;
    Promise.resolve().then(() => { if (active) setPhotoUrl(url); });
    return () => { active = false; URL.revokeObjectURL(url); };
  }, [blob]);
  return photoUrl ? <img className="catch-card-photo" src={photoUrl} alt={`Úlovek – ${species}`} /> : <div className="catch-card-icon" aria-hidden="true">🐟</div>;
}

function CatchCard({ catchedFish }) {
  return (
    <Link to={`/catch/${catchedFish.id}`} className="catch-card-link">
      <div className="catch-card">
        <div className="catch-card-main">
          {catchedFish.photos?.[0]?.blob ? <CatchPhoto blob={catchedFish.photos[0].blob} species={catchedFish.species} /> : <div className="catch-card-icon" aria-hidden="true">🐟</div>}

          <div className="catch-card-info">
            <h2>{catchedFish.species}</h2>

            {(catchedFish.locationName || catchedFish.method?.label) && <p>📍 {catchedFish.locationName || "Lokalita neuvedena"}{catchedFish.method?.label ? ` · 🎣 ${catchedFish.method.label}` : ""}</p>}

            <div className="tags">
              {catchedFish.isFavorite && <span className="catch-card-tag">Oblíbený</span>}

              {catchedFish.result === "released" && (
                <span className="tag tag-released">↩️ Puštěno</span>
              )}

              {catchedFish.result === "kept" && (
                <span className="tag tag-kept">Ponecháno</span>
              )}
              {catchedFish.tripTitle && <span className="catch-card-tag">Výprava: {catchedFish.tripTitle}</span>}
            </div>
          </div>

          <div className="catch-card-right">
            {catchedFish.weightKg != null && <p>{catchedFish.weightKg} kg</p>}

            {catchedFish.lengthCm != null && <p>{catchedFish.lengthCm} cm</p>}
          </div>
        </div>

        <div className="catch-card-footer">
          <p>{formatCatchDateTime(catchedFish.caughtAt)}</p>

          {catchedFish.fightMinutes != null && <p>⏱️ {formatFightDuration(catchedFish.fightMinutes)}</p>}

        </div>
      </div>
    </Link>
  );
}

export default CatchCard;
