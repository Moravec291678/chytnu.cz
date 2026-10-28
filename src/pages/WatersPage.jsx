import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { distanceBetweenCoordinatesMeters } from "../features/waters/data/nearbyWaterMatch.js";
import { buildWaterActivity, filterWaters } from "../features/waters/data/waterModel.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { useTrips } from "../features/trips/context/useTrips.js";
import { EmptyState, ErrorState, LoadingSkeleton, NoResultsState, PermissionDeniedState } from "../shared/components/UIStates.jsx";
import "./WatersPage.css";

const tabs = [
  { id: "favorites", label: "Oblíbené" },
  { id: "nearby", label: "V okolí" },
  { id: "all", label: "Všechny" },
];

function getLocationError(error) {
  if (error?.code === 1) return "Poloha není povolená. Povol ji v nastavení prohlížeče a zkus to znovu.";
  if (error?.code === 2) return "Poloha teď není dostupná. Zkontroluj nastavení polohy zařízení.";
  if (error?.code === 3) return "Získání polohy trvalo příliš dlouho. Zkus to znovu.";
  return "Polohu se nepodařilo získat.";
}

function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) return `≈ ${Math.max(1, Math.round(distanceMeters))} m`;
  return `≈ ${(distanceMeters / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} km`;
}

function WatersPage() {
  const scope = useDataScope();
  const catchState = useCatches().state;
  const tripState = useTrips().state;
  const [waters, setWaters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [favoriteSavingId, setFavoriteSavingId] = useState(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("favorites");
  const [position, setPosition] = useState(null);
  const [positionStatus, setPositionStatus] = useState("idle");
  const [positionError, setPositionError] = useState("");
  const [locationDenied, setLocationDenied] = useState(false);

  const loadWaters = useCallback(async () => {
    if (scope.status !== "ready") return;
    setLoading(true);
    setError("");
    try {
      setWaters(await waterRepository.list(scope));
    } catch {
      setError("Revíry se nepodařilo načíst z místního úložiště. Zkus to znovu.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void Promise.resolve().then(loadWaters);
  }, [loadWaters]);

  const requestPosition = () => {
    if (!navigator.geolocation) {
      setPositionStatus("error");
      setPositionError("Tento prohlížeč nepodporuje získání polohy.");
      setLocationDenied(false);
      return;
    }
    setPositionStatus("loading");
    setPositionError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ latitude: coords.latitude, longitude: coords.longitude });
        setPositionStatus("ready");
      },
      (locationError) => {
        setPosition(null);
        setPositionStatus("error");
        setPositionError(getLocationError(locationError));
        setLocationDenied(locationError?.code === 1);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  };

  const toggleFavorite = async (event, water) => {
    event.preventDefault();
    event.stopPropagation();
    if (favoriteSavingId) return;
    setFavoriteSavingId(water.id);
    setActionError("");
    try {
      const updated = { ...water, isFavorite: !water.isFavorite };
      await waterRepository.put(updated, scope);
      setWaters((previous) => previous.map((item) => (item.id === water.id ? updated : item)));
    } catch {
      setActionError("Oblíbený revír se nepodařilo uložit. Zkus to znovu.");
    } finally {
      setFavoriteSavingId(null);
    }
  };

  const activityByWater = useMemo(() => buildWaterActivity(
    waters,
    catchState.catches,
    tripState.trips,
  ), [waters, catchState.catches, tripState.trips]);
  const activityAvailable = !catchState.error && !tripState.error;
  const filtered = useMemo(() => {
    const matches = filterWaters(waters, {
      query: search,
      favoriteOnly: tab === "favorites",
    });
    if (tab !== "nearby" || !position) return matches;
    return matches
      .map((water) => ({ water, distanceMeters: distanceBetweenCoordinatesMeters(position, water.coordinates) }))
      .filter(({ distanceMeters }) => distanceMeters !== null)
      .sort((left, right) => left.distanceMeters - right.distanceMeters);
  }, [waters, search, tab, position]);

  const noWaters = waters.length === 0;
  const activityLoading = catchState.loading || tripState.loading;

  return (
    <Layout>
      <div className="waters-page">
        <header className="waters-header">
          <div>
            <h1>Revíry</h1>
            <p>Databáze revírů</p>
          </div>
          <Link to="/waters/new" className="waters-add-btn" aria-label="Přidat revír">+</Link>
        </header>

        <label className="waters-search">
          <span className="sr-only">Hledat revír</span>
          <input
            type="search"
            aria-label="Hledat revír podle názvu, čísla nebo typu"
            placeholder="Hledat revír…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="waters-tabs" role="tablist" aria-label="Výběr revírů">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {actionError && <p role="alert" className="water-action-error">{actionError}</p>}

        {loading || activityLoading ? (
          <LoadingSkeleton className="waters-list waters-skeleton" itemClassName="water-skeleton-card" label="Načítám revíry" count={4} />
        ) : error ? (
          <ErrorState className="waters-empty" title="Revíry se nepodařilo načíst" message={error} onRetry={loadWaters} />
        ) : tab === "nearby" && !position ? (
          locationDenied ? <PermissionDeniedState className="waters-empty waters-location-empty" title="Poloha není povolená" description="Vzdálenost revírů nelze bez polohy spočítat. Deník a ostatní části aplikace můžeš používat dál. Oprávnění můžeš změnit v nastavení prohlížeče." onRetry={requestPosition} />
            : positionStatus === "error" ? <ErrorState className="waters-empty waters-location-empty" title="Polohu se nepodařilo zjistit" message={positionError} onRetry={requestPosition} />
              : <EmptyState className="waters-empty waters-location-empty" title="Zobrazit revíry v okolí" description={positionError || "Poloha se použije jen pro výpočet vzdálenosti v tomto seznamu a nikam se neukládá."} action={<button type="button" onClick={requestPosition} disabled={positionStatus === "loading"}>{positionStatus === "loading" ? "Zjišťuji polohu…" : "Povolit polohu"}</button>} />
        ) : noWaters ? (
          <EmptyState className="waters-empty" title="Zatím nemáš uložené žádné revíry" description="Přidej svůj první revír a přiřazuj k němu úlovky a vycházky." action={<Link to="/waters/new">Přidat první revír</Link>} />
        ) : tab === "nearby" && position && filtered.length === 0 ? (
          <EmptyState className="waters-empty" title="V okolí nejsou revíry se známou polohou" description="Vzdálenost zobrazíme jen u revírů se skutečně uloženými souřadnicemi." />
        ) : filtered.length === 0 ? (
          <NoResultsState className="waters-empty" title={tab === "favorites" ? "Zatím nemáš oblíbené revíry" : "Žádný revír neodpovídá hledání"} description={tab === "favorites" ? "Oblíbený revír přidáš klepnutím na hvězdu u jeho karty." : "Zkus upravit hledání nebo zobrazit všechny revíry."} action={search ? <button type="button" onClick={() => setSearch("")}>Zrušit hledání</button> : null} />
        ) : (
          <div className="waters-list" aria-label="Seznam revírů">
            {filtered.map((item) => {
              const water = tab === "nearby" ? item.water : item;
              const distanceMeters = tab === "nearby" ? item.distanceMeters : null;
              const activity = activityByWater.get(water.id);
              return (
                <article key={water.id} className="water-card">
                  <Link to={`/waters/${water.id}`} className="water-card-link" aria-label={`Detail revíru ${water.name}`}>
                    <span className="water-card-icon" aria-hidden="true">
                      <svg viewBox="0 0 48 48"><path d="M7 24c8-10 21-13 32-5l6-5v20l-6-5C28 37 15 34 7 24Z" /><circle cx="33" cy="22" r="1.6" /></svg>
                    </span>
                    <span className="water-card-info">
                      <strong className="water-card-name">{water.name}</strong>
                      <span className="water-card-meta">
                        {[water.type, distanceMeters !== null ? formatDistance(distanceMeters) : null, water.waterNumber ? `č. ${water.waterNumber}` : null]
                          .filter(Boolean).join(" · ")}
                      </span>
                      <span className="water-card-badges">
                        {water.isFavorite && <span className="water-badge water-badge-favorite">Oblíbený</span>}
                        {activity?.isActive && <span className="water-badge water-badge-active">Aktivní</span>}
                      </span>
                    </span>
                  </Link>
                  <span className="water-card-activity" aria-label={activityAvailable ? `${activity?.recentCount ?? 0} aktivit za posledních 30 dní` : "Aktivitu se nepodařilo načíst"}>
                    <strong>{activityAvailable && !activityLoading ? activity?.recentCount ?? 0 : "—"}</strong>
                    <span>{activityAvailable && !activityLoading ? "za 30 dní" : "záznamů"}</span>
                  </span>
                  <button
                    type="button"
                    className={`water-card-fav${water.isFavorite ? " is-favorite" : ""}`}
                    aria-label={water.isFavorite ? `Odebrat ${water.name} z oblíbených` : `Přidat ${water.name} do oblíbených`}
                    aria-pressed={Boolean(water.isFavorite)}
                    disabled={favoriteSavingId === water.id}
                    onClick={(event) => toggleFavorite(event, water)}
                  >
                    {water.isFavorite ? "★" : "☆"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default WatersPage;
