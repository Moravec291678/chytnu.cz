import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { photoFrameStyle } from "../features/catches/data/photoFraming.js";
import { getPrimaryAvailablePhoto } from "../features/catches/data/catchPhotos.js";
import { createDetailPhotoDelivery } from "../features/catches/data/detailPhotoDelivery.js";
import { getPhotoBlobForDisplay } from "../features/catches/data/photoCloudService.js";
import { getPhotoAvailability, PHOTO_AVAILABILITY } from "../features/catches/data/photoAvailability.js";
import PhotoSyncStatus from "../features/catches/components/PhotoSyncStatus.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useTrips } from "../features/trips/context/useTrips";
import { getCatchRecognition, isNewLengthRecord } from "../features/catches/data/catchDetail.js";
import { buildPrivateCatchMarkers } from "../features/map/data/catchMap";
import { DEFAULT_SPECIES } from "../shared/constants/constants.js";
import { getCatchRarity } from "../features/catches/utils/rarity.js";
import { getVerificationPresentation } from "../features/catches/data/verificationPresentation.js";
import { focusPhotoOpener } from "../shared/components/photoViewerNavigation.js";
import PhotoViewer, { ViewerImage } from "../shared/components/PhotoViewer.jsx";
import { isFeatureEnabled } from "../shared/config/featureFlags.js";
import { formatCatchWeight } from "../features/catches/data/catchWeight.js";
import ConfirmDialog from "../shared/components/ConfirmDialog";
import "../features/catches/components/PhotoSyncStatus.css";
import "./AddCatchPage.css";
import { isIncompleteQuickCatch } from "../features/catches/data/quickCatch.js";
import CatchAiAssistance from "../features/ai/CatchAiAssistance.jsx";
import { buildCatchEnvironmentPresentation } from "../features/catches/data/catchEnvironmentPresentation.js";
import { normalizeCatchPrivacy } from "../features/privacy/data/privacyModel.js";

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
  const [deliveredPhotos, setDeliveredPhotos] = useState(null);
  const photoScope = JSON.stringify([scope.scopeKey, id]);
  const photos = deliveredPhotos?.key === photoScope ? deliveredPhotos.items : [];
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const delivery = useRef(null);
  const [missingCloudPhotoId, setMissingCloudPhotoId] = useState(null);
  const missingCloudPhoto = missingCloudPhotoId === item?.id;
  const [preview, setPreview] = useState(null);
  const primaryPhoto = item ? getPrimaryAvailablePhoto(item) : null;
  const heroPhoto = photos.find((photo) => photo.id === primaryPhoto?.id) ?? photos[0] ?? null;
  const viewerPhotos = heroPhoto ? [heroPhoto, ...photos.filter(photo => photo.id !== heroPhoto.id)] : [];
  const viewerIndex = preview?.key === photoScope ? viewerPhotos.findIndex(photo => photo.id === preview.id) : -1;
  const selectPhoto = photo => setPreview({ key: photoScope, id: photo.id });
  const openPhoto = (event, photo) => { focusPhotoOpener(event); selectPhoto(photo); };
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const savingFavoriteRef = useRef(false);
  const deletingRef = useRef(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const controller = createDetailPhotoDelivery(getPhotoBlobForDisplay, (ready, errors) => {
      setDeliveredPhotos({ key: photoScope, items: ready });
      setPhotoLoadFailed(errors.some(code => code !== "cloudinary_asset_missing"));
      setMissingCloudPhotoId(errors.includes("cloudinary_asset_missing") ? id : null);
    });
    delivery.current = controller;
    return () => { controller.close(); delivery.current = null; };
  }, [id, photoScope, scope.ownerId]);

  const updatePhotos = useCallback((retryFailed = false) => {
    delivery.current?.update(item?.photos ?? [], { ownerId: scope.ownerId, scopeKey: scope.scopeKey, catchId: id }, retryFailed);
  }, [item?.photos, scope.ownerId, scope.scopeKey, id]);
  useEffect(() => { updatePhotos(); }, [updatePhotos]);
  const retryPhotoLoads = () => updatePhotos(true);

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
  const closeDeleteDialog = useCallback(() => setConfirmingDelete(false), [setConfirmingDelete]);
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
  if (!item) return <Layout back={{ to: "/journal", useHistory: false }}><section className="add-catch-section"><h1>Úlovek nenalezen</h1><p>Mohl být smazán nebo uložené místní úložiště není dostupné.</p></section></Layout>;

  const placeFacts = [
    ["Revír", item.locationName],
    ["Uložený revír", item.waterId ? <Link to={`/waters/${item.waterId}`}>Otevřít detail revíru →</Link> : null],
    ["Číslo revíru", item.waterNumber],
    ["Čas úlovku", catchDateLabel],
    ["Čas pořízení fotografie", item.photos?.find(photo => photo.captureMetadata?.capturedAt)?.captureMetadata?.capturedAt ? formatDate(item.photos.find(photo => photo.captureMetadata?.capturedAt).captureMetadata.capturedAt) : null],
    ["Fotografie uložena do aplikace", item.quickCatch?.capturedAt ? formatDate(item.quickCatch.capturedAt) : null],
    ["GPS", item.coordinates ? `${item.coordinates.latitude}, ${item.coordinates.longitude}` : item.gpsLocation],
    ["Zdroj polohy", ({ "photo-exif": "GPS fotografie", "live-gps": "Poloha zařízení při úlovku", "manual-map": "Ručně zvoleno na mapě", manual: "Ručně zadáno" })[item.gpsSource]],
    ["Přesnost polohy", valueLabel(item.locationEvidence?.accuracyMeters, "m")],
    ["Poloha zaznamenána", item.locationEvidence?.capturedAt ? formatDate(item.locationEvidence.capturedAt) : null],
    ["Zdroj fotografie", item.quickCatch ? item.quickCatch.inputSource === "camera" ? "Fotoaparát" : "Galerie" : null],
    ["Časové pásmo zařízení při uložení", item.quickCatch?.timeZone],
    ["Vycházka", trip ? <Link to={`/trips/${trip.id}`}>{trip.title} →</Link> : null],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const methodFacts = [
    ["Metoda", item.method?.label],
    ["Nástraha", item.baits?.map((bait) => bait.label).join(", ")],
    ["Výsledek", item.result === "released" ? "Puštěno zpět" : item.result === "kept" ? "Ponecháno" : null],
    ["Délka boje", valueLabel(item.fightMinutes, "min")],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const environment = buildCatchEnvironmentPresentation(item, { online: globalThis.navigator?.onLine !== false });
  const privacy = normalizeCatchPrivacy(item.privacy);
  const recognition = getCatchRecognition(item, state.catches);
  const isPersonalBest = recognition.personalBest;
  const isSpeciesRecord = recognition.speciesRecord;
  const isLengthRecord = isNewLengthRecord(item, state.catches);
  const hasMapLocation = buildPrivateCatchMarkers([item]).length > 0;
  const rarity = item.captureMode === "quick" && !item.speciesKey ? null : getCatchRarity(item, DEFAULT_SPECIES);
  const verificationCopy = getVerificationPresentation(item.verification);
  const displayedPhotoIds = new Set(photos.map((photo) => photo.id));
  const unresolvedPhotos = (item.photos ?? []).filter((photo) => !displayedPhotoIds.has(photo.id));
  const hasPendingPhotos = unresolvedPhotos.some((photo) => [PHOTO_AVAILABILITY.PENDING, PHOTO_AVAILABILITY.SYNCING]
    .includes(getPhotoAvailability(photo)));
  const hasBrokenPhotos = unresolvedPhotos.some((photo) => getPhotoAvailability(photo) === PHOTO_AVAILABILITY.BROKEN);

  return <Layout>
    <div className="add-catch-page catch-detail-page">
      <section className="catch-detail-hero">
        <header className="catch-detail-toolbar">
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
        {item.quickCatch && item.quickCatch.provenance?.caughtAt !== "manual" && <p className="catch-detail-date">Čas převzatý z fotografie nebo jejího uložení; přesný čas záběru nebyl potvrzen.</p>}
        {item.quickCatch && <details className="catch-detail-date">
          <summary>Původ doplněných údajů</summary>
          <dl>{Object.entries(item.quickCatch.provenance ?? {}).map(([field, source]) => {
            const labels = { caughtAt: "Datum a čas", coordinates: "Poloha", tripId: "Vycházka", locationName: "Místo",
              waterId: "Revír", waterNumber: "Číslo revíru", method: "Metoda", baits: "Nástrahy", waterDepthM: "Hloubka", bottomType: "Dno", waterTempC: "Teplota vody", moonPhase: "Fáze měsíce", airTempC: "Teplota vzduchu",
              pressureHpa: "Tlak", windKmh: "Vítr", speciesKey: "Druh ryby", lengthCm: "Délka", weightKg: "Hmotnost" };
            const sources = { manual: "Potvrzeno při úpravě", device: "Čas uložení v zařízení", exif: "Údaje fotografie",
              active_trip: "Aktivní vycházka", gps: "Poloha zařízení", weather_api: "Zdroj počasí", derived: "Výpočet podle data",
              saved_water: "Uložený revír" };
            const value = ["moonPhase", "airTempC", "pressureHpa", "windKmh", "waterTempC"].includes(field) ? item.conditions?.[field] : item[field];
            const present = value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
            return labels[field] && sources[source] ? <div key={field}><dt>{labels[field]}</dt><dd>{present ? sources[source] : "Nezadáno"}</dd></div> : null;
          })}</dl>
        </details>}
        {isIncompleteQuickCatch(item) && <p className="catch-detail-date"><Link to={`/catch/${item.id}/edit`}>Doplnit později</Link> · {!item.speciesKey ? "Druh zatím neurčen. " : ""}{!Number.isFinite(item.lengthCm) ? "Délka nezadána." : ""}</p>}
        <div className="catch-detail-badges">
          {rarity && <span className={`catch-detail-badge catch-detail-badge-rarity catch-detail-badge-rarity--${rarity.key}`}>{rarity.label}</span>}
          {isPersonalBest && <span className="catch-detail-badge catch-detail-badge-record">Osobní rekord</span>}
          {isSpeciesRecord && <span className="catch-detail-badge catch-detail-badge-species">Rekord druhu</span>}
          {item.method?.label && <span className="catch-detail-badge catch-detail-badge-method">{item.method.label}</span>}
          {item.isFavorite && <span className="catch-detail-badge">Oblíbený</span>}
          {item.verification && <span className={item.verification.status === "verified" ? "catch-detail-badge catch-detail-badge-positive" : "catch-detail-badge"}>{verificationCopy.label}</span>}
          {item.result === "released" && <span className="catch-detail-badge catch-detail-badge-positive">Puštěno</span>}
          {item.result === "kept" && <span className="catch-detail-badge catch-detail-badge-danger">Ponecháno</span>}
        </div>
        {item.verification?.level === "limited" && <p className="catch-detail-date" role="status">
          {verificationCopy.message}
          {" "}<Link to={`/catch/${item.id}/edit`}>Doplnit úlovek</Link>
        </p>}
        {item.verification?.status === "unverified" && item.verification?.level !== "limited" && <p className="catch-detail-date" role="status">
          Úlovek uložen. <span>Zatím bez XP.</span> Fotku a údaje o čase či místě můžeš doplnit později.
          {" "}<Link to={`/catch/${item.id}/edit`}>Doplnit úlovek</Link>
        </p>}
      </section>
      {location.state?.saved && <p role="status">Úlovek byl uložen do tohoto zařízení.</p>}
      {error && <p role="alert" className="catch-form-error">{error}</p>}
      {tripState.error && item.tripId && <p role="alert" className="catch-form-error">Přiřazenou vycházku se nepodařilo načíst: {tripState.error}</p>}
      {tripState.loading && item.tripId && <p role="status">Načítám přiřazenou vycházku…</p>}
      {heroPhoto && <section className="catch-detail-photo-gallery" aria-label="Fotografie úlovku">
        <figure className="photo-preview-item catch-detail-hero-photo"><button type="button" className="photo-open-button" onClick={event => openPhoto(event, heroPhoto)} aria-label={`Otevřít hlavní fotografii úlovku – ${item.species}`}><img src={heroPhoto.url} style={photoFrameStyle(heroPhoto)} alt="" /></button><figcaption>Hlavní fotografie</figcaption></figure>
        {viewerPhotos.length > 1 && <div className="catch-detail-photo-strip">{viewerPhotos.slice(1).map((photo, index) => <button type="button" key={photo.id} onClick={event => openPhoto(event, photo)} aria-label={`Zobrazit fotografii ${index + 2} – ${item.species}`}><img src={photo.url} style={photoFrameStyle(photo)} alt="" /></button>)}</div>}
      </section>}
      {(item.photos ?? []).some((photo) => photo.uploadReady === false && photo.blob instanceof Blob)
        ? <p className="catch-photo-unavailable" role="status">Původní fotografie zůstává uložená v tomto zařízení, ale není připravená k synchronizaci. Převeď ji na JPG, PNG nebo WebP a <Link to={`/catch/${item.id}/edit`}>nahraď ji</Link>.</p>
        : (item.photos ?? []).some((photo) => photo.localError?.code === "photo_local_blob_unreadable")
          && !(item.photos ?? []).some((photo) => photo.cloud?.state === "synced")
          ? <p className="catch-photo-unavailable" role="status">Fotografii se na tomto zařízení nepodařilo přečíst. <Link to={`/catch/${item.id}/edit`}>Nahraď fotografii</Link>.</p>
        : missingCloudPhoto ? <p className="catch-photo-unavailable" role="status">Původní cloudová fotografie chybí. <Link to={`/catch/${item.id}/edit`}>Přidej ji znovu</Link>.</p>
        : hasBrokenPhotos || (item.photos ?? []).some((photo) => photo.cloud?.state === "unavailable")
          ? <p className="catch-photo-unavailable" role="status">Fotografii nelze bezpečně obnovit z uložených dat. <Link to={`/catch/${item.id}/edit`}>Přidej ji znovu</Link>, případně ji ulož jako JPG, PNG nebo WebP.</p>
        : photoLoadFailed ? <p className="catch-photo-unavailable" role="status">{item.photos?.some((photo) => photo.localError?.code === "photo_local_blob_unreadable")
          ? "Fotografii se na tomto zařízení nepodařilo přečíst. " : "Cloudovou fotografii se nepodařilo načíst. "}<button type="button" onClick={retryPhotoLoads}>Zkusit znovu</button></p>
          : hasPendingPhotos && <PhotoSyncStatus className="photo-sync-status catch-photo-sync-status" />}
      {viewerIndex >= 0 && <PhotoViewer items={viewerPhotos} index={viewerIndex} onSelect={index => selectPhoto(viewerPhotos[index])}
        onClose={() => setPreview(null)} describe={() => ({ title: item.species, description: catchDateLabel })}
        renderImage={photo => <ViewerImage key={photo.url} src={photo.url} alt={`Fotografie úlovku – ${item.species}`} />} />}
      <section className="catch-detail-measures" aria-label="Míry úlovku">
        <div><strong>{Number.isFinite(item.lengthCm) ? formatNumber(item.lengthCm) : "—"}</strong><span>cm</span><small>DÉLKA</small>{isLengthRecord && <em>Nový rekord</em>}{isPersonalBest && recognition.personalBestUnit === "cm" && <em>{recognition.personalBestDelta > 0 ? `+${formatNumber(recognition.personalBestDelta, 1)} cm rekord` : "Osobní rekord"}</em>}</div>
        <div><strong>{Number.isFinite(item.weightKg) ? formatCatchWeight(item) : "—"}</strong><span>kg</span><small>{item.weightSource === "estimated" ? "ODHAD HMOTNOSTI" : "HMOTNOST"}</small>{isPersonalBest && recognition.personalBestUnit === "kg" && <em>{recognition.personalBestDelta > 0 ? `+${formatNumber(recognition.personalBestDelta, 2)} kg rekord` : "Osobní rekord"}</em>}</div>
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
      {Number.isFinite(item.girthCm) && <CatchDetailFacts title="Další míry ryby" facts={[["Obvod", valueLabel(item.girthCm, "cm")]]} />}
      {methodFacts.length > 0 && <CatchDetailFacts title="Lov a nástraha" facts={methodFacts} />}
      {environment.weather.length > 0 && <CatchDetailFacts title="Počasí" facts={environment.weather} />}
      {environment.weatherSource && <p className="catch-detail-source">Zdroj: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · {environment.weatherSource.kind === "historical-reanalysis" ? "historická reanalýza" : "meteorologický model"} pro {formatDate(environment.weatherSource.hour)}. Nejde o měření přímo u vody.</p>}
      {environment.astronomy.length > 0 && <CatchDetailFacts title="Slunce a Měsíc" facts={environment.astronomy} />}
      {environment.water.length > 0 && <CatchDetailFacts title="Podmínky u vody" facts={environment.water} />}
      {environment.status && <section className="catch-detail-section catch-detail-enrichment"><h2>Automatické doplnění</h2><p role="status">{environment.status}</p><details><summary>Co může zůstat neznámé</summary><p>Teplotu vody, průtok ani stav hladiny bez ověřeného zdroje nedoplňujeme. Z fotografie neurčujeme míry, nástrahu ani hloubku. Chybějící údaj neznamená nulu.</p></details></section>}
      {item.notes && <section className="catch-detail-section catch-detail-notes"><h2>Poznámka</h2><p>{item.notes}</p></section>}
      <details className="catch-detail-section"><summary>Soukromí úlovku</summary><dl className="catch-detail-list">
        {[["Úlovek", privacy.visibility === "private" ? "Soukromý" : "Veřejný"], ["Fotografie", privacy.photoVisibility === "private" ? "Soukromá" : "Veřejná"],
          ["Sdílená poloha", privacy.privateSpot || privacy.locationPrecision === "none" ? "Skrytá" : privacy.locationPrecision === "approximate" ? "Přibližná" : "Přesná"],
          ["Soukromé místo", privacy.privateSpot ? "Ano" : "Ne"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl></details>
      <CatchAiAssistance key={`${scope.scopeKey}:${item.id}`} record={item} />
      {hasMapLocation && <Link className="catch-detail-map-link" to={`/journal/map?catch=${encodeURIComponent(item.id)}`}>Zobrazit úlovek na soukromé mapě</Link>}
      <div className="catch-detail-actions">
        {isFeatureEnabled("publicSharing") && <Link className="save-catch-button" to={`/catch/${item.id}/share`}>Sdílet úlovek</Link>}
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
