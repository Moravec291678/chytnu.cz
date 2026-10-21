import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { photoFrameStyle } from "../features/catches/data/photoFraming.js";
import { getPrimaryAvailablePhoto } from "../features/catches/data/catchPhotos.js";
import { getPhotoBlobForDisplay } from "../features/catches/data/photoCloudService.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useTrips } from "../features/trips/context/useTrips";
import { formatBottomType } from "../features/catches/data/catchFormatting";
import { getCatchRecognition, isNewLengthRecord } from "../features/catches/data/catchDetail.js";
import { buildPrivateCatchMarkers } from "../features/map/data/catchMap";
import { MOON_PHASE_EMOJI } from "../shared/constants/moonPhaseEmoji.js";
import { DEFAULT_SPECIES } from "../shared/constants/constants.js";
import { getCatchRarity } from "../features/catches/utils/rarity.js";
import { formatCatchWeight } from "../features/catches/data/catchWeight.js";
import ConfirmDialog from "../shared/components/ConfirmDialog";
import "./AddCatchPage.css";

function formatDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function valueLabel(value, unit) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : `${value} ${unit}`;
}

function formatNumber(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits }).format(value);
}

function getConditionFacts(conditions) {
  const values = conditions ?? {};
  const facts = [
    ["Vzduch", valueLabel(values.airTempC ?? values.airTemperatureC, "°C")],
    ["Voda", valueLabel(values.waterTempC ?? values.waterTemperatureC, "°C")],
    ["Tlak", valueLabel(values.pressureHpa, "hPa")],
    ["Vítr", values.windKmh === null || values.windKmh === undefined || values.windKmh === "" || !Number.isFinite(Number(values.windKmh))
      ? null
      : `${values.windDirection ? `${values.windDirection} ` : ""}${formatNumber(Number(values.windKmh))} km/h`],
    ["Počasí", values.weather],
    ["Fáze měsíce", MOON_PHASE_EMOJI[values.moonPhase] ?? values.moonPhase],
  ];
  return facts.filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function CatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, deleteCatch, toggleFavorite, refresh } = useCatches();
  const scope = useDataScope();
  const { state: tripState } = useTrips();
  const item = state.catches.find((record) => record.id === id);
  const trip = tripState.trips.find((record) => record.id === item?.tripId);
  const catchDateLabel = item ? formatDate(item.caughtAt) : null;
  const [photos, setPhotos] = useState([]);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [photoRetryVersion, setPhotoRetryVersion] = useState(0);
  const [missingCloudPhotoId, setMissingCloudPhotoId] = useState(null);
  const missingCloudPhoto = missingCloudPhotoId === item?.id;
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const primaryPhoto = item ? getPrimaryAvailablePhoto(item) : null;
  const heroPhoto = photos.find((photo) => photo.id === primaryPhoto?.id) ?? photos[0] ?? null;
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const savingFavoriteRef = useRef(false);
  const deletingRef = useRef(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!item) return undefined;
    let active = true;
    const entries = [];
    let loadFailed = false;
    Promise.all((item.photos ?? []).map(async (photo) => {
      if (photo.cloud?.state === "unavailable") return null;
      try {
        const blob = await getPhotoBlobForDisplay({ photo, ownerId: scope.ownerId, catchId: item.id, scopeKey: scope.scopeKey });
        return blob ? { ...photo, blob, url: URL.createObjectURL(blob) } : null;
      } catch (photoError) {
        if (active && photoError?.code === "cloudinary_asset_missing") setMissingCloudPhotoId(item.id);
        else if (active) loadFailed = true;
        return null;
      }
    })).then((loaded) => {
      if (!active) { loaded.filter(Boolean).forEach((photo) => URL.revokeObjectURL(photo.url)); return; }
      entries.push(...loaded.filter(Boolean));
      setPhotos(entries);
      setPhotoLoadFailed(loadFailed);
    });
    return () => {
      active = false;
      entries.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, [item, scope.ownerId, scope.scopeKey, photoRetryVersion]);

  const retryPhotoLoads = () => {
    setPhotoLoadFailed(false);
    setMissingCloudPhotoId(null);
    setPhotoRetryVersion((version) => version + 1);
  };

  const handleDelete = async () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setError("");
    try {
      await deleteCatch(id);
      navigate("/journal", { replace: true });
    } catch (deleteError) {
      setError(deleteError.message || "Úlovek se nepodařilo smazat.");
      deletingRef.current = false;
      setDeleting(false);
    }
  };
  const handleBack = () => navigate(location.key === "default" ? "/journal" : -1);
  const closeDeleteDialog = useCallback(() => setConfirmingDelete(false), []);
  const handleToggleFavorite = async () => {
    if (savingFavoriteRef.current) return;
    savingFavoriteRef.current = true;
    setSavingFavorite(true);
    setError("");
    try {
      await toggleFavorite(id);
    } catch (favoriteError) {
      setError(favoriteError.message || "Oblíbený stav se nepodařilo uložit.");
    } finally {
      savingFavoriteRef.current = false;
      setSavingFavorite(false);
    }
  };

  if (state.loading) return <Layout><p className="loading-state" role="status">Načítám úlovek…</p></Layout>;
  if (state.error) return <Layout><section className="add-catch-section" role="alert"><h1>Úlovek se nepodařilo načíst</h1><p>{state.error}</p><button type="button" onClick={refresh}>Zkusit znovu</button></section></Layout>;
  if (!item) return <Layout><section className="add-catch-section"><h1>Úlovek nenalezen</h1><p>Mohl být smazán nebo uložené místní úložiště není dostupné.</p><Link to="/journal">Zpět do deníku</Link></section></Layout>;

  const placeFacts = [
    ["Revír", item.locationName],
    ["Uložený revír", item.waterId ? <Link to={`/waters/${item.waterId}`}>Otevřít detail revíru →</Link> : null],
    ["Číslo revíru", item.waterNumber],
    ["Datum a čas", catchDateLabel],
    ["Hloubka", item.waterDepthM === null || item.waterDepthM === undefined
      ? null
      : `${formatNumber(item.waterDepthM)} m${formatBottomType(item.bottomType) ? ` · ${formatBottomType(item.bottomType).toLocaleLowerCase("cs-CZ")}` : ""}`],
    ["Obvod", valueLabel(item.girthCm, "cm")],
    ["Výprava", trip ? <Link to={`/trips/${trip.id}`}>{trip.title} →</Link> : null],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const methodFacts = [
    ["Metoda", item.method?.label],
    ["Nástraha", item.baits?.map((bait) => bait.label).join(", ")],
    ["Výsledek", item.result === "released" ? "Puštěno zpět" : item.result === "kept" ? "Ponecháno" : null],
    ["Délka boje", valueLabel(item.fightMinutes, "min")],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const conditionFacts = getConditionFacts(item.conditions);
  const recognition = getCatchRecognition(item, state.catches);
  const isPersonalBest = recognition.personalBest;
  const isSpeciesRecord = recognition.speciesRecord;
  const isLengthRecord = isNewLengthRecord(item, state.catches);
  const hasMapLocation = buildPrivateCatchMarkers([item]).length > 0;
  const rarity = getCatchRarity(item, DEFAULT_SPECIES);

  return <Layout>
    <div className="add-catch-page catch-detail-page">
      <section className="catch-detail-hero">
        <header className="catch-detail-toolbar">
          <button className="catch-detail-back" type="button" onClick={handleBack} aria-label="Zpět">←</button>
          <div>
            <button
              className={item.isFavorite ? "catch-detail-icon-button catch-detail-favorite catch-detail-favorite--active" : "catch-detail-icon-button catch-detail-favorite"}
              type="button"
              aria-label={item.isFavorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
              aria-pressed={Boolean(item.isFavorite)}
              disabled={savingFavorite}
              onClick={handleToggleFavorite}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.3-.9L12 3Z" /></svg>
            </button>
            <Link className="catch-detail-icon-button" to={`/catch/${item.id}/edit`} aria-label="Upravit úlovek">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.2-.9L19 8.3 15.7 5 4.9 15.8 4 20Z" /></svg>
            </Link>
          </div>
        </header>
        {item.speciesLatin && <p className="catch-detail-latin">{item.speciesLatin}</p>}
        {item.speciesKey ? (
          <h1 className="catch-detail-species-heading">
            <Link to={`/species/${item.speciesKey}`} className="catch-detail-species-link" title="Zobrazit detail druhu">
              {item.species}
            </Link>
          </h1>
        ) : (
          <h1>{item.species}</h1>
        )}
        {catchDateLabel && <p className="catch-detail-date">{catchDateLabel}</p>}
        <div className="catch-detail-badges">
          {rarity && <span className={`catch-detail-badge catch-detail-badge-rarity catch-detail-badge-rarity--${rarity.key}`}>{rarity.label}</span>}
          {isPersonalBest && <span className="catch-detail-badge catch-detail-badge-record">Osobní rekord</span>}
          {isSpeciesRecord && <span className="catch-detail-badge catch-detail-badge-species">Rekord druhu</span>}
          {item.method?.label && <span className="catch-detail-badge catch-detail-badge-method">{item.method.label}</span>}
          {item.isFavorite && <span className="catch-detail-badge">Oblíbený</span>}
          {item.result === "released" && <span className="catch-detail-badge catch-detail-badge-positive">Puštěno</span>}
          {item.result === "kept" && <span className="catch-detail-badge catch-detail-badge-danger">Ponecháno</span>}
        </div>
      </section>
      {location.state?.saved && <p role="status">Úlovek byl uložen do tohoto zařízení.</p>}
      {error && <p role="alert" className="catch-form-error">{error}</p>}
      {tripState.error && item.tripId && <p role="alert" className="catch-form-error">Přiřazenou výpravu se nepodařilo načíst: {tripState.error}</p>}
      {tripState.loading && item.tripId && <p role="status">Načítám přiřazenou výpravu…</p>}
      {heroPhoto && <section className="catch-detail-photo-gallery" aria-label="Fotografie úlovku">
        <figure className="photo-preview-item catch-detail-hero-photo"><img src={heroPhoto.url} style={photoFrameStyle(heroPhoto)} alt={`Hlavní fotografie úlovku – ${item.species}`} /><figcaption>Hlavní fotografie</figcaption></figure>
        {photos.length > 1 && <div className="catch-detail-photo-strip">{photos.filter((photo) => photo.id !== heroPhoto.id).map((photo) => <button type="button" key={photo.id} onClick={() => setPreviewPhoto(photo)} aria-label={`Zobrazit fotografii ${photo.name}`}><img src={photo.url} style={photoFrameStyle(photo)} alt="" /></button>)}</div>}
      </section>}
      {missingCloudPhoto ? <p className="catch-photo-unavailable" role="status">Původní cloudová fotografie chybí. <Link to={`/catch/${item.id}/edit`}>Přidej ji znovu</Link>.</p>
        : (item.photos ?? []).some((photo) => photo.cloud?.state === "unavailable")
          ? <p className="catch-photo-unavailable" role="status">Fotografii nelze bezpečně obnovit z uložených dat. <Link to={`/catch/${item.id}/edit`}>Přidej ji znovu</Link>, případně ji ulož jako JPG, PNG nebo WebP.</p>
        : photoLoadFailed ? <p className="catch-photo-unavailable" role="status">Cloudovou fotografii se nepodařilo načíst. <button type="button" onClick={retryPhotoLoads}>Zkusit znovu</button></p>
          : (item.photos ?? []).some((photo) => !photo.blob && photo.cloud?.state !== "synced")
            ? <p className="catch-photo-unavailable" role="status">Původní fotografie není dostupná. <Link to={`/catch/${item.id}/edit`}>Přidej ji znovu</Link>.</p>
            : (item.photos ?? []).some((photo) => !photo.blob) && <p className="catch-photo-unavailable" role="status">Některé fotografie se načítají ze synchronizovaného úložiště.</p>}
      {previewPhoto && <div className="catch-photo-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewPhoto(null); }}><section role="dialog" aria-modal="true" aria-label="Náhled fotografie"><button type="button" onClick={() => setPreviewPhoto(null)} aria-label="Zavřít náhled">Zavřít</button><img src={previewPhoto.url} style={photoFrameStyle(previewPhoto)} alt={`Fotografie úlovku – ${item.species}`} /></section></div>}
      <section className="catch-detail-measures" aria-label="Míry úlovku">
        <div><strong>{Number.isFinite(item.weightKg) ? formatCatchWeight(item) : "—"}</strong><span>kg</span><small>{item.weightSource === "estimated" ? "ODHAD HMOTNOSTI" : "HMOTNOST"}</small>{isPersonalBest && <em>{recognition.personalBestDelta > 0 ? `+${formatNumber(recognition.personalBestDelta, 2)} kg rekord` : "Osobní rekord"}</em>}</div>
        <div><strong>{Number.isFinite(item.lengthCm) ? formatNumber(item.lengthCm) : "—"}</strong><span>cm</span><small>DÉLKA</small>{isLengthRecord && <em>Nový rekord</em>}</div>
        <div><strong>{Number.isFinite(item.fightMinutes) ? item.fightMinutes : "—"}</strong><span>{Number.isFinite(item.fightMinutes) ? "min" : ""}</span><small>BOJ</small></div>
      </section>
      {recognition.personalBest || recognition.speciesRecord || recognition.seasonRecord || recognition.newLocation ? (
        <section className="catch-detail-section" aria-labelledby="catch-detail-awards-title">
          <h2 id="catch-detail-awards-title">Ocenění</h2>
          <div className="catch-detail-awards">
            {recognition.personalBest && <span className="catch-detail-award catch-detail-award--orange">Osobní rekord</span>}
            {recognition.speciesRecord && <span className="catch-detail-award catch-detail-award--orange">Rekord druhu</span>}
            {recognition.seasonRecord && <span className="catch-detail-award catch-detail-award--green">Rekord sezóny</span>}
            {recognition.newLocation && <span className="catch-detail-award catch-detail-award--blue">Nová lokalita</span>}
          </div>
        </section>
      ) : null}
      {placeFacts.length > 0 && <CatchDetailFacts title="Místo a čas" facts={placeFacts} />}
      {methodFacts.length > 0 && <CatchDetailFacts title="Lov a nástraha" facts={methodFacts} />}
      {conditionFacts.length > 0 && <CatchDetailFacts title="Podmínky" facts={conditionFacts} />}
      {item.notes && <section className="catch-detail-section catch-detail-notes"><h2>Poznámka</h2><p>{item.notes}</p></section>}
      {hasMapLocation && <Link className="catch-detail-map-link" to={`/map?catch=${encodeURIComponent(item.id)}`}>Zobrazit úlovek na soukromé mapě</Link>}
      <div className="catch-detail-actions">
        <Link className="save-catch-button" to={`/catch/${item.id}/share`}>Sdílet úlovek</Link>
        <button className="photo-action-button" type="button" onClick={() => setConfirmingDelete(true)} disabled={deleting}>{deleting ? "Mažu…" : "Smazat úlovek"}</button>
      </div>
      {confirmingDelete && <ConfirmDialog titleId="delete-catch-title" descriptionId="delete-catch-description" title="Smazat úlovek?" description="Tato akce smaže úlovek i jeho lokálně uloženou fotografii. Nelze ji vrátit." busy={deleting} confirmLabel="Smazat úlovek" busyLabel="Mažu…" confirmClassName="catch-delete-confirm" onCancel={closeDeleteDialog} onConfirm={handleDelete} />}
    </div>
  </Layout>;
}

function CatchDetailFacts({ title, facts }) {
  return (
    <section className="catch-detail-section">
      <h2>{title}</h2>
      <dl className="catch-detail-list">
        {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  );
}

export default CatchDetailPage;
