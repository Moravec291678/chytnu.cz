import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  formatCatchDateTime,
  formatFightDuration,
} from "../../../shared/utils/formatters";
import { formatCatchWeight } from "../data/catchWeight.js";
import { photoFrameStyle } from "../data/photoFraming.js";
import { getPrimaryAvailablePhoto } from "../data/catchPhotos.js";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { getPhotoBlobForDisplay } from "../data/photoCloudService.js";

import "./CatchCard.css";

function CatchPhoto({ blob, species, photo, ownerId, catchId }) {
  const [photoUrl, setPhotoUrl] = useState("");
  const [displayBlob, setDisplayBlob] = useState(blob);
  const [photoFailed, setPhotoFailed] = useState(false);
  const attemptedFallback = useRef(false);
  useEffect(() => {
    if (!displayBlob) return undefined;
    let active = true;
    let url = "";
    Promise.resolve().then(() => {
      if (!active) return;
      try { url = URL.createObjectURL(displayBlob); setPhotoUrl(url); }
      catch { setPhotoFailed(true); }
    });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [displayBlob]);
  if (photoFailed) return <div className="catch-card-photo-error" role="img" aria-label="Fotografii se v tomto zařízení nepodařilo zobrazit.">Fotografii se v tomto zařízení nepodařilo zobrazit.</div>;
  return photoUrl ? <img className="catch-card-photo" src={photoUrl} alt={`Úlovek – ${species}`} style={photoFrameStyle(photo)} onError={async () => {
    if (attemptedFallback.current || !ownerId || !photo.cloud?.objectKey) { setPhotoFailed(true); return; }
    attemptedFallback.current = true;
    try {
      const recovered = await getPhotoBlobForDisplay({ photo, ownerId, catchId, scopeKey: accountScopeKey(ownerId) });
      if (recovered && recovered !== displayBlob) setDisplayBlob(recovered);
      else setPhotoFailed(true);
    } catch { setPhotoFailed(true); }
  }} /> : <div className="catch-card-icon" aria-hidden="true">🐟</div>;
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
  const primaryPhoto = getPrimaryAvailablePhoto(catchedFish);
  const weight = formatCatchWeight(catchedFish);
  const length = Number.isFinite(catchedFish.lengthCm)
    ? catchedFish.lengthCm.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })
    : null;

  return (
    <Link to={`/catch/${catchedFish.id}`} className={`catch-card-link${isPersonalRecord ? " catch-card-link-record" : ""}`}>
      <article className={`catch-card${isPersonalRecord ? " catch-card-record" : ""}`}>
        <div className="catch-card-main">
          {primaryPhoto?.blob ? <CatchPhoto key={primaryPhoto.id} blob={primaryPhoto.blob} species={catchedFish.species} photo={primaryPhoto} ownerId={catchedFish.ownerId} catchId={catchedFish.id} /> : <FishMark speciesKey={catchedFish.speciesKey} />}

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
