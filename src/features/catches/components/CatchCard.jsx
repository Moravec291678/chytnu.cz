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
import { getPhotoAvailability, PHOTO_AVAILABILITY } from "../data/photoAvailability.js";
import PhotoSyncStatus from "./PhotoSyncStatus.js";
import { Badge, Card } from "../../../shared/components/UIPrimitives.jsx";

import "./PhotoSyncStatus.css";
import "./CatchCard.css";

function CatchPhoto({ blob, species, photo, ownerId, catchId }) {
  const [photoUrl, setPhotoUrl] = useState("");
  const [displayBlob, setDisplayBlob] = useState(blob ?? null);
  const [loadState, setLoadState] = useState(blob ? "ready" : "idle");
  const [loadErrorCode, setLoadErrorCode] = useState("");
  const attemptedFallback = useRef(false);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (blob instanceof Blob) return blob;
      if (photo?.cloud?.state !== "synced" || !ownerId) return null;
      return getPhotoBlobForDisplay({ photo, ownerId, catchId, scopeKey: accountScopeKey(ownerId) });
    }).then((recovered) => {
      if (!active) return;
      setPhotoUrl("");
      setLoadErrorCode("");
      if (recovered) {
        attemptedFallback.current = false;
        setDisplayBlob(recovered);
        setLoadState("ready");
      } else {
        setDisplayBlob(null);
        setLoadState("missing");
      }
    }).catch((error) => {
      if (!active) return;
      setLoadErrorCode(error?.code ?? "");
      setLoadState("error");
    });
    return () => { active = false; };
  }, [blob, photo, ownerId, catchId]);
  useEffect(() => {
    if (!(displayBlob instanceof Blob)) return undefined;
    let active = true;
    let url = "";
    Promise.resolve().then(() => {
      if (!active) return;
      try { url = URL.createObjectURL(displayBlob); setPhotoUrl(url); }
      catch { setLoadState("error"); setLoadErrorCode("photo_local_blob_unreadable"); }
    });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [displayBlob]);
  const availability = getPhotoAvailability(photo, { loadState, errorCode: loadErrorCode });
  if (availability === PHOTO_AVAILABILITY.PENDING || availability === PHOTO_AVAILABILITY.SYNCING) {
    return <PhotoSyncStatus className="photo-sync-status catch-card-photo-sync" compact />;
  }
  if (availability === PHOTO_AVAILABILITY.BROKEN) {
    return <div className="catch-card-photo-error" role="status">Fotografii se nepodařilo načíst.</div>;
  }
  if (availability === PHOTO_AVAILABILITY.RETRYABLE_ERROR) {
    return <div className="catch-card-photo-error" role="status">Fotografii se teď nepodařilo načíst. Otevři úlovek a zkus to znovu.</div>;
  }
  return photoUrl ? <img className="catch-card-photo" src={photoUrl} alt={`Úlovek – ${species}`} style={photoFrameStyle(photo)} onError={async () => {
    if (attemptedFallback.current || !ownerId || !photo.cloud?.objectKey) { setLoadState("error"); return; }
    attemptedFallback.current = true;
    setLoadState("loading");
    try {
      const recovered = await getPhotoBlobForDisplay({ photo, ownerId, catchId, scopeKey: accountScopeKey(ownerId) });
      if (recovered && recovered !== displayBlob) setDisplayBlob(recovered);
      else setLoadState("error");
    } catch (error) { setLoadErrorCode(error?.code ?? ""); setLoadState("error"); }
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
      <Card as="article" density="compact" interactive className={`catch-card${isPersonalRecord ? " catch-card-record" : ""}`}>
        <div className="catch-card-main">
          {primaryPhoto ? <CatchPhoto key={primaryPhoto.id} blob={primaryPhoto.blob} species={catchedFish.species} photo={primaryPhoto} ownerId={catchedFish.ownerId} catchId={catchedFish.id} /> : <FishMark speciesKey={catchedFish.speciesKey} />}

          <div className="catch-card-info">
            <h2>{catchedFish.species}</h2>

            <p>{formatCatchDateTime(catchedFish.caughtAt)}{catchedFish.locationName ? ` · ${catchedFish.locationName}` : ""}{catchedFish.method?.label ? ` · ${catchedFish.method.label}` : ""}</p>

            <div className="tags">
              {isPersonalRecord && <Badge size="compact" tone="record">Osobní rekord</Badge>}
              {catchedFish.isFavorite && <Badge size="compact">Oblíbený</Badge>}

              {catchedFish.result === "released" && (
                <Badge size="compact" tone="released">Puštěno</Badge>
              )}

              {catchedFish.result === "kept" && (
                <Badge size="compact" tone="kept">Ponecháno</Badge>
              )}
              {catchedFish.verification?.level === "limited" && <Badge size="compact">Omezené ověření</Badge>}
              {catchedFish.verification?.status === "unverified" && catchedFish.verification?.level !== "limited" && <Badge size="compact">Neověřený úlovek</Badge>}
              {catchedFish.tripTitle && <Badge size="compact">Vycházka: {catchedFish.tripTitle}</Badge>}
            </div>
          </div>

          <div className="catch-card-right">
            {length && <small>{length} cm</small>}
            {weight && <strong>{weight}</strong>}
            {weight && <span>kg</span>}
          </div>
        </div>

        {catchedFish.fightMinutes != null && <div className="catch-card-footer"><span>Délka boje</span><span>{formatFightDuration(catchedFish.fightMinutes)}</span></div>}
      </Card>
    </Link>
  );
}

export default CatchCard;
