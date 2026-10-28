import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { useTrips } from "../features/trips/context/useTrips.js";
import { createTripRecord } from "../features/trips/data/tripModel.js";
import { getWaterCatchSeasonCounts, getWaterHourlyCatchRate, getWaterRelatedCatches, getWaterRelatedTrips, getWaterTodayTripCount } from "../features/waters/data/waterDetailStats.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import CatchCard from "../features/catches/components/CatchCard.jsx";
import "./WaterDetailPage.css";

function WaterDetailPage() {
  const { waterId } = useParams();
  const scope = useDataScope();
  const navigate = useNavigate();
  const { state: catchState } = useCatches();
  const { state: tripState, startTrip, refresh: refreshTrips } = useTrips();
  const [water, setWater] = useState(null);
  const [allWaters, setAllWaters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [startingTrip, setStartingTrip] = useState(false);
  const startingTripRef = useRef(false);

  const loadWater = useCallback(async () => {
    if (scope.status !== "ready") return;
    setLoading(true);
    setError("");
    try {
      const [record, waters] = await Promise.all([
        waterRepository.get(waterId, scope),
        waterRepository.list(scope),
      ]);
      setWater(record);
      setAllWaters(waters);
    } catch (loadError) {
      setError(loadError?.message || "Revír se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  }, [waterId, scope]);

  useEffect(() => {
    void Promise.resolve().then(loadWater);
  }, [loadWater]);

  const relatedCatches = useMemo(() => water
    ? getWaterRelatedCatches(water, catchState.catches, allWaters)
    : [], [water, allWaters, catchState.catches]);
  const relatedTrips = useMemo(() => water
    ? getWaterRelatedTrips(water, tripState.trips, relatedCatches)
    : [], [water, tripState.trips, relatedCatches]);
  const activeTrip = tripState.trips.find((trip) => !trip.endedAt) ?? null;
  const activeTripForWater = activeTrip && relatedTrips.some((trip) => trip.id === activeTrip.id) ? activeTrip : null;
  const speciesObserved = useMemo(() => [...new Set(relatedCatches.map((record) => record.species).filter(Boolean))], [relatedCatches]);
  const seasonCounts = useMemo(() => getWaterCatchSeasonCounts(relatedCatches), [relatedCatches]);
  const hourlyStats = useMemo(() => getWaterHourlyCatchRate(relatedTrips, relatedCatches), [relatedTrips, relatedCatches]);
  const todayTrips = useMemo(() => getWaterTodayTripCount(relatedTrips), [relatedTrips]);
  const dataLoading = loading || catchState.loading || tripState.loading;
  const dataError = catchState.error || tripState.error;

  const toggleFavorite = async () => {
    if (!water || favoriteSaving) return;
    setFavoriteSaving(true);
    setActionError("");
    try {
      const updated = { ...water, isFavorite: !water.isFavorite };
      await waterRepository.put(updated, scope);
      setWater(updated);
    } catch (favoriteError) {
      setActionError(favoriteError?.message || "Oblíbený revír se nepodařilo uložit.");
    } finally {
      setFavoriteSaving(false);
    }
  };

  const startOrOpenTrip = async () => {
    if (!water || startingTripRef.current) return;
    setActionError("");
    if (activeTrip) {
      if (!activeTripForWater) {
        setActionError("Už máš aktivní jinou vycházku. Nejprve ji otevři a případně ukonči.");
      } else {
        navigate(`/trips/${activeTrip.id}`);
      }
      return;
    }
    startingTripRef.current = true;
    setStartingTrip(true);
    try {
      const trip = createTripRecord({ locationName: water.name });
      const started = await startTrip({ ...trip, waterId: water.id });
      navigate(`/trips/${started.id}`);
    } catch (tripError) {
      setActionError(tripError?.message || "Vycházku se nepodařilo zahájit.");
      await refreshTrips();
    } finally {
      startingTripRef.current = false;
      setStartingTrip(false);
    }
  };

  if (dataLoading) {
    return <Layout><div className="water-detail-page"><p className="loading-state" role="status">Načítám detail revíru…</p></div></Layout>;
  }

  if (error) {
    return <Layout><div className="water-detail-page"><section className="water-detail-empty" role="alert">
      <h1>Revír se nepodařilo načíst</h1><p>{error}</p><Link to="/waters">Zpět na seznam revírů</Link>
    </section></div></Layout>;
  }

  if (!water) {
    return <Layout><div className="water-detail-page">
      <header className="water-detail-actions"><Link to="/waters" aria-label="Zpět na seznam revírů">←</Link></header>
      <section className="water-detail-empty" aria-labelledby="water-detail-title">
        <p className="water-detail-kicker">REVÍR NENALEZEN</p>
        <h1 id="water-detail-title">Požadovaný revír neexistuje</h1>
        <p>Záznam revíru mohl být smazán nebo máš otevřený jiný profil.</p>
        <Link to="/waters">Zpět na seznam revírů</Link>
      </section>
    </div></Layout>;
  }

  const seasonTotal = seasonCounts.reduce((total, season) => total + season.count, 0);
  const maximumRate = Math.max(0, ...hourlyStats.hours.map((item) => item.catchesPerHour ?? 0));
  const activityError = dataError ? "Aktivitu úlovků nebo vycházek se nepodařilo načíst. Některé statistiky proto nejsou dostupné." : "";

  return <Layout>
    <div className="water-detail-page">
      <header className="water-detail-actions">
        <Link to="/waters" aria-label="Zpět na seznam revírů" className="water-detail-icon-button">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <button
          type="button"
          className={`water-detail-icon-button${water.isFavorite ? " is-favorite" : ""}`}
          aria-label={water.isFavorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
          aria-pressed={Boolean(water.isFavorite)}
          disabled={favoriteSaving}
          onClick={toggleFavorite}
        >{water.isFavorite ? "★" : "☆"}</button>
        <Link to={`/waters/${water.id}/edit`} aria-label="Upravit revír" className="water-detail-icon-button">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z" /><path d="m14.8 5.7 3.5 3.5" /></svg>
        </Link>
        <Link to={`/waters/${water.id}/chat`} aria-label="Chat revíru" className="water-detail-icon-button">💬</Link>
      </header>

      {actionError && <p role="alert" className="water-action-error">{actionError}{activeTrip && !activeTripForWater && <> <Link to={`/trips/${activeTrip.id}`}>Otevřít aktivní vycházku</Link></>}</p>}

      <section className="water-detail-hero">
        <p className="water-detail-kicker">{water.type}{water.waterNumber ? ` · č. ${water.waterNumber}` : ""}</p>
        <h1>{water.name}</h1>
        {water.area && <p className="water-detail-area">{water.area}</p>}
        <div className="water-detail-badges">
          {activeTripForWater && <span className="water-detail-badge water-detail-badge-active">Aktivní</span>}
          {water.isFavorite && <span className="water-detail-badge water-detail-badge-favorite">Oblíbený</span>}
        </div>
      </section>

      {activityError && <p role="status" className="water-detail-data-warning">{activityError}</p>}

      <section className="water-detail-stats-grid" aria-label="Statistiky revíru">
        <article className="water-stat-box"><strong>{dataError ? "—" : todayTrips}</strong><span>Dnes u vody</span></article>
        <article className="water-stat-box"><strong>—</strong><span>Hodnocení</span><small>Bez dostupných hodnocení</small></article>
        <article className="water-stat-box"><strong>{dataError ? "—" : relatedTrips.length}</strong><span>Moje výjezdy</span></article>
      </section>

      <section className="water-detail-species" aria-labelledby="water-species-title">
        <h2 id="water-species-title">Druhy ryb</h2>
        {dataError ? <p className="water-detail-insufficient">Druhy podle úlovků nejsou momentálně dostupné.</p> : speciesObserved.length > 0 ? (
          <>
            <p className="water-detail-section-caption">Zaznamenané úlovky · {relatedCatches.length}</p>
            <div className="water-species-chips">{speciesObserved.map((species) => <span key={species} className="water-species-tag">{species}</span>)}</div>
          </>
        ) : <p className="water-detail-insufficient">Na tomto revíru zatím nemáš zapsaný žádný úlovek.</p>}
        {water.targetFish?.length > 0 && <div className="water-detail-target-fish">
          <p className="water-detail-section-caption">Druhy uložené u revíru</p>
          <div className="water-species-chips">{water.targetFish.map((species) => <span key={species} className="water-species-tag water-species-tag-target">{species}</span>)}</div>
        </div>}
      </section>

      <section className="water-detail-seasons" aria-labelledby="water-seasons-title">
        <h2 id="water-seasons-title">Sezónní informace</h2>
        {dataError ? <p className="water-detail-insufficient">Vlastní sezónní přehled není momentálně dostupný.</p> : seasonTotal === 0 ? (
          <p className="water-detail-insufficient">Sezónní přehled se zobrazí po zapsání úlovků s platným datem. Jde o historii tvých úlovků, ne předpověď aktivity ryb.</p>
        ) : <>
          <p className="water-detail-section-caption">Tvoje úlovky podle období · {seasonTotal} záznamů</p>
          <div className="water-season-grid">{seasonCounts.map((season) => <article className="water-season-row" key={season.key}>
            <span>{season.label}</span><strong>{season.count}</strong>
          </article>)}</div>
        </>}
      </section>

      <section className="water-detail-hourly" aria-labelledby="water-hourly-title">
        <h2 id="water-hourly-title">Úspěšnost podle hodin</h2>
        <p className="water-detail-section-caption">Počet úlovků za hodinu zaznamenaného času u vody</p>
        {dataError ? <p className="water-detail-insufficient">Hodinový přehled není momentálně dostupný.</p> : !hourlyStats.sufficient ? (
          <p className="water-detail-insufficient">Zatím nemáme dost údajů. Pro výpočet jsou potřeba dokončené vycházky s časem začátku i konce; minimum jsou {hourlyStats.minimumEffortHours} hodiny. Úlovky bez vazby na vycházku se nezapočítávají.</p>
        ) : <>
          <div className="water-hour-bars" role="img" aria-label={`Hodinový průměr z ${hourlyStats.effortHours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} hodin zaznamenaných vycházek`}>
            {hourlyStats.hours.map((hour) => {
              const height = hour.catchesPerHour === null || maximumRate === 0 ? 0 : Math.max(6, (hour.catchesPerHour / maximumRate) * 100);
              return <span key={hour.hour} className="water-hour-bar" title={`${String(hour.hour).padStart(2, "0")}:00 · ${hour.catchesPerHour === null ? "bez zaznamenaného času" : `${hour.catchesPerHour.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} úlovků/h`}`}>
                <i style={{ height: `${height}%` }} />
              </span>;
            })}
          </div>
          <div className="water-hour-labels" aria-hidden="true"><span>00 h</span><span>06 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
          <p className="water-detail-hour-summary">{hourlyStats.catchCount} úlovků z {hourlyStats.effortHours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} hodin vycházek</p>
        </>}
      </section>

      <section className="water-detail-catches" aria-labelledby="water-catches-title">
        <h2 id="water-catches-title">Moje úlovky na tomto revíru ({dataError ? "—" : relatedCatches.length})</h2>
        {dataError ? <p className="water-no-catches">Úlovky nejsou momentálně dostupné.</p> : relatedCatches.length === 0 ? (
          <p className="water-no-catches">Na tomto revíru zatím nemáš zapsaný žádný úlovek.</p>
        ) : <div className="water-catches-list">{relatedCatches.map((record) => <CatchCard key={record.id} catchedFish={record} />)}</div>}
      </section>

      <footer className="water-detail-cta">
        <button type="button" className="water-detail-checkin" onClick={startOrOpenTrip} disabled={startingTrip || tripState.loading}>
          {startingTrip ? "Zahajuji vycházku…" : activeTripForWater ? "Pokračovat ve vycházce" : activeTrip ? "Jsem tady" : "Jsem tady"}
        </button>
        <Link className="water-detail-save" to="/add" state={{ preselectedWaterId: water.id }}>Uložit</Link>
      </footer>
    </div>
  </Layout>;
}

export default WaterDetailPage;
