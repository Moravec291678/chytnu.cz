import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  formatCatchDateTime,
  formatFightDuration,
} from "../../../shared/utils/formatters";
import { formatCatchWeight } from "../data/catchWeight.js";
import { photoFrameStyle } from "../data/photoFraming.js";

import "./CatchCard.css";

function CatchPhoto({ blob, species, photo }) {
  const [photoUrl, setPhotoUrl] = useState("");
  useEffect(() => {
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    let active = true;
    Promise.resolve().then(() => { if (active) setPhotoUrl(url); });
    return () => { active = false; URL.revokeObjectURL(url); };
  }, [blob]);
  return photoUrl ? <img className="catch-card-photo" src={photoUrl} alt={`Úlovek – ${species}`} style={photoFrameStyle(photo)} /> : <div className="catch-card-icon" aria-hidden="true">🐟</div>;
}

export function FishMark({ speciesKey = "" }) {
  const tone = speciesKey.toLowerCase().includes("pike") || speciesKey.toLowerCase().includes("trout")
    ? "blue"
    : speciesKey.toLowerCase().includes("perch") || speciesKey.toLowerCase().includes("zander")
      ? "orange"
      : "green";

  return <span className={`catch-fish-mark catch-fish-mark-${tone}`} aria-hidden="true">
    <svg viewBox="0 0 40 28"><path d="M4 14c5-7 13-10 22-7l9-5v24l-9-5C17 24 9 21 4 14Z" /></svg>
  </span>;
}

function CatchCard({ catchedFish, isPersonalRecord = false }) {
  const weight = formatCatchWeight(catchedFish);
  const length = Number.isFinite(catchedFish.lengthCm)
    ? catchedFish.lengthCm.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })
    : null;

  return (
    <Link to={`/catch/${catchedFish.id}`} className={`catch-card-link${isPersonalRecord ? " catch-card-link-record" : ""}`}>
      <article className={`catch-card${isPersonalRecord ? " catch-card-record" : ""}`}>
        <div className="catch-card-main">
          {catchedFish.photos?.[0]?.blob ? <CatchPhoto blob={catchedFish.photos[0].blob} species={catchedFish.species} photo={catchedFish.photos[0]} /> : <FishMark speciesKey={catchedFish.speciesKey} />}

          <div className="catch-card-info">
            <h2>{catchedFish.species}</h2>

            <p>{formatCatchDateTime(catchedFish.caughtAt)}{catchedFish.locationName ? ` · ${catchedFish.locationName}` : ""}{catchedFish.method?.label ? ` · ${catchedFish.method.label}` : ""}</p>

            <div className="tags">
              {isPersonalRecord && <span className="catch-card-tag catch-card-tag-record">Osobní rekord</span>}
              {catchedFish.isFavorite && <span className="catch-card-tag">Oblíbený</span>}

              {catchedFish.result === "released" && (
                <span className="catch-card-tag catch-card-tag-released">Puštěno</span>
              )}

              {catchedFish.result === "kept" && (
                <span className="catch-card-tag catch-card-tag-kept">Ponecháno</span>
              )}
              {catchedFish.tripTitle && <span className="catch-card-tag">Výprava: {catchedFish.tripTitle}</span>}
            </div>
          </div>

          <div className="catch-card-right">
            {weight && <strong>{weight}</strong>}
            {weight && <span>kg</span>}
            {length && <small>{length} cm</small>}
          </div>
        </div>

        {catchedFish.fightMinutes != null && <div className="catch-card-footer"><span>Délka boje</span><span>{formatFightDuration(catchedFish.fightMinutes)}</span></div>}
      </article>
    </Link>
  );
}

export default CatchCard;
