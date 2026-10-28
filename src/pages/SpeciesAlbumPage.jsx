import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { formatCatchMeasurements } from "../features/catches/data/catchWeight.js";
import { selectBestCatch } from "../features/catches/data/catchSize.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import {
  buildSeasonCollections,
  buildSpeciesAlbum,
  buildTrophyRecords,
  getSpeciesAlbumYear,
} from "../features/species/data/speciesAlbum";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import { formatTripCatchCount } from "../features/trips/data/tripModel";
import { buildVisitedWaterCollections } from "../features/waters/data/waterDetailStats.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { DEFAULT_SPECIES } from "../shared/constants/constants";
import "./SpeciesAlbumPage.css";

const numberFormat = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });

function measurement(value, unit) {
  return Number.isFinite(value) ? `${numberFormat.format(value)} ${unit}` : "Neuvedeno";
}

function countLabel(count, one, few, many) {
  if (count === 1) return `${count} ${one}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

function SpeciesAlbumPage() {
  const scope = useDataScope();
  const { state: catchState, refresh: refreshCatches } = useCatches();
  const { state: tripState, refresh: refreshTrips } = useTrips();
  const [waterState, setWaterState] = useState({ scopeKey: null, records: [], loading: true, error: "" });
  const catches = catchState.catches ?? [];
  const trips = tripState.trips ?? [];
  const { summary: progression, loading: progressionLoading, error: progressionError } = useProgression();
  const loadWaters = useCallback(async () => {
    if (scope.status !== "ready") return;
    setWaterState({ scopeKey: scope.scopeKey, records: [], loading: true, error: "" });
    try {
      const records = await waterRepository.list(scope);
      setWaterState({ scopeKey: scope.scopeKey, records, loading: false, error: "" });
    } catch (error) {
      setWaterState({ scopeKey: scope.scopeKey, records: [], loading: false, error: error?.message || "Revíry se nepodařilo načíst." });
    }
  }, [scope]);
  useEffect(() => { void Promise.resolve().then(loadWaters); }, [loadWaters]);
  const waters = waterState.scopeKey === scope.scopeKey ? waterState.records : [];
  const waterError = waterState.scopeKey === scope.scopeKey ? waterState.error : "";
  const waterLoading = scope.status !== "ready" || waterState.scopeKey !== scope.scopeKey || waterState.loading;
  const album = buildSpeciesAlbum(catches, DEFAULT_SPECIES, progression.mastery);
  const discovered = album.filter((item) => item.discovered).length;
  const visitedWaters = buildVisitedWaterCollections(waters, catches, trips);
  const currentYear = getSpeciesAlbumYear();
  const seasons = buildSeasonCollections(catches, trips, currentYear);
  const trophies = buildTrophyRecords(catches, DEFAULT_SPECIES);
  const yearRecord = selectBestCatch(catches.filter((record) => getSpeciesAlbumYear(record.caughtAt) === currentYear));
  const isLoading = catchState.loading || tripState.loading || progressionLoading || waterLoading;
  const errors = [catchState.error, tripState.error, progressionError, waterError].filter(Boolean);

  const retry = () => {
    void Promise.all([refreshCatches(), refreshTrips(), loadWaters()]);
  };

  return <Layout><div className="album-page">
    <header className="album-header">
      <Link to="/profile">← Profil</Link>
      <div className="album-heading">
        <div><p className="album-eyebrow">TVŮJ RYBÁŘSKÝ DENÍK</p><h1>Sbírky</h1></div>
        <span className="album-total">{discovered}<span>/{album.length}</span></span>
      </div>
      <p>Druhy, místa a osobní rekordy zapsané v deníku.</p>
    </header>

    {isLoading ? <p className="album-status" role="status">Načítám tvoje sbírky…</p> : errors.length
      ? <section className="album-error" role="alert">
        <h2>Data sbírek se nepodařilo načíst</h2>
        {errors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}
        <button type="button" onClick={retry}>Zkusit znovu</button>
      </section>
      : <>
        <section className="album-section" aria-labelledby="album-species-title">
          <div className="album-section-heading">
            <div><p className="album-eyebrow">01 · OBJEVENÉ DRUHY</p><h2 id="album-species-title">Druhové album</h2></div>
            <span>{discovered} z {album.length}</span>
          </div>
          {discovered === 0 && <p className="album-empty-intro">První úlovek odemkne kartu druhu. Dosavadní záznamy se tu zobrazí automaticky.</p>}
          <div className="album-grid">{album.map((species) => {
            if (!species.discovered) {
              return <article className="album-card album-card--locked" aria-label="Neobjevený druh" key={species.key}>
                <span className="album-fish" aria-hidden="true">?</span>
                <span className="album-locked-label">Neobjeveno</span>
                <span className="album-lock-mark" aria-hidden="true">◇</span>
              </article>;
            }
            const stars = species.stars;
            return <Link className="album-card album-card--discovered" to={`/species/${species.key}`} key={species.key}>
              <span className="album-fish" aria-hidden="true">🐟</span>
              <strong>{species.label}</strong>
              <span className="album-stars" aria-label={`${stars} ${stars === 1 ? "hvězda" : "hvězdy"} mistrovství`}>
                {"★".repeat(stars)}<span>{"☆".repeat(Math.max(0, 5 - stars))}</span>
              </span>
              <span>{formatTripCatchCount(species.catchCount)}</span>
              <span className="album-record">Rekord {species.bestLengthCm !== null ? measurement(species.bestLengthCm, "cm") : measurement(species.bestWeightKg, "kg")}</span>
            </Link>;
          })}</div>
        </section>

        <section className="album-section" aria-labelledby="album-locations-title">
          <div className="album-section-heading">
            <div><p className="album-eyebrow">02 · NAVŠTÍVENÉ REVÍRY</p><h2 id="album-locations-title">Revíry</h2></div>
            <span>{visitedWaters.length} navštívené</span>
          </div>
          {visitedWaters.length
            ? <div className="album-list">{visitedWaters.map((water) => <Link className="album-list-card" to={`/waters/${water.id}`} key={water.id}>
              <span className="album-list-icon" aria-hidden="true">⌖</span>
              <div><h3>{water.name}</h3><p>
                {water.type && <span>{water.type}</span>}
                {water.type && (water.catchCount > 0 || water.tripCount > 0) && <span aria-hidden="true"> · </span>}
                {water.catchCount > 0 && <span>{formatTripCatchCount(water.catchCount)}</span>}
                {water.catchCount > 0 && water.tripCount > 0 && <span aria-hidden="true"> · </span>}
                {water.tripCount > 0 && <span>{countLabel(water.tripCount, "vycházka", "vycházky", "vycházek")}</span>}
              </p></div>
              <span className="album-list-arrow" aria-hidden="true">›</span>
            </Link>)}</div>
            : <p className="album-empty">Revíry se zobrazí po propojení skutečného úlovku nebo vycházky s uloženým revírem.</p>}
        </section>

        <section className="album-section" aria-labelledby="album-seasons-title">
          <div className="album-section-heading">
            <div><p className="album-eyebrow">03 · ROK {currentYear}</p><h2 id="album-seasons-title">Sezónní přehled</h2></div>
            <span>{seasons.length}</span>
          </div>
          {seasons.length
            ? <div className="album-season-grid">{seasons.map((season) => <article className="album-season-card" key={season.key}>
              <span className={`album-season-mark album-season-mark--${season.key}`} aria-hidden="true">{season.name.slice(0, 1)}</span>
              <div><h3>{season.name}</h3><p>{season.catchCount > 0 ? formatTripCatchCount(season.catchCount) : "Bez úlovků"}{season.tripCount > 0 ? ` · ${countLabel(season.tripCount, "vycházka", "vycházky", "vycházek")}` : ""}</p></div>
            </article>)}</div>
            : <p className="album-empty">V tomto roce zatím nejsou uložené úlovky ani vycházky.</p>}
        </section>

        <section className="album-section" aria-labelledby="album-records-title">
          <div className="album-section-heading">
            <div><p className="album-eyebrow">04 · Z MĚŘENÝCH ÚLOVKŮ</p><h2 id="album-records-title">Osobní rekordy</h2></div>
            <Link to="/profile#profile-trophy-editor">Upravit</Link>
          </div>
          {yearRecord && <article className="album-year-record">
            <span aria-hidden="true">✦</span>
            <div><p>NEJDELŠÍ ÚLOVEK ROKU {currentYear}</p><strong>{formatCatchMeasurements(yearRecord)}</strong><span>{yearRecord.species || "Druh neuveden"}</span></div>
            {yearRecord.id && <Link to={`/catch/${yearRecord.id}`} aria-label="Otevřít nejdelší úlovek roku">›</Link>}
          </article>}
          {trophies.length
            ? <div className="album-list album-trophies">{trophies.map((record, index) => {
              const content = <><span className="album-rank">{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{record.speciesName}</h3><p>{record.catch.locationName?.trim() || "Místo neuvedeno"}</p></div>
                <strong>{formatCatchMeasurements(record.catch)}</strong></>;
              return record.catch.id
                ? <Link className="album-list-card album-trophy-card" to={`/catch/${record.catch.id}`} key={`${record.speciesKey}-${record.catch.id}`}>{content}</Link>
                : <article className="album-list-card album-trophy-card" key={`${record.speciesKey}-${index}`}>{content}</article>;
            })}</div>
            : <p className="album-empty">Rekordy se objeví po uložení délky nebo hmotnosti úlovku.</p>}
          {yearRecord && <p className="album-year-note">Roční rekord upřednostňuje délku; u starších záznamů bez délky použije hmotnost.</p>}
        </section>
      </>}
  </div></Layout>;
}

export default SpeciesAlbumPage;
