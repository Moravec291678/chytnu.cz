import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { isMeasuredCatchWeight } from "../features/catches/data/catchWeight.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { useTrips } from "../features/trips/context/useTrips.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import CatchCard from "../features/catches/components/CatchCard.jsx";
import "./WaterDetailPage.css";

function WaterDetailPage() {
  const { waterId } = useParams();
  const scope = useDataScope();
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();

  const [water, setWater] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [allWaters, setAllWaters] = useState([]);

  const loadWater = useCallback(async () => {
    if (scope.status !== "ready") return;
    setLoading(true);
    setError("");
    try {
      const data = await waterRepository.get(waterId, scope);
      const waters = await waterRepository.list(scope);
      setAllWaters(waters);
      setWater(data);
    } catch (err) {
      setError(err?.message || "Revír se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  }, [waterId, scope]);

  useEffect(() => {
    void Promise.resolve().then(loadWater);
  }, [loadWater]);

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

  // Connected real user catches and trips for this water
  const relatedCatches = useMemo(() => {
    if (!water) return [];
    const numberMatches = water.waterNumber
      ? allWaters.filter((item) => String(item.waterNumber || "").replace(/\s/g, "") === String(water.waterNumber).replace(/\s/g, "")).length
      : 0;
    return catchState.catches.filter((item) => {
      if (item.waterId) return item.waterId === water.id;
      if (numberMatches === 1 && water.waterNumber && String(item.waterNumber || "").replace(/\s/g, "") === String(water.waterNumber).replace(/\s/g, "")) return true;
      return false;
    });
  }, [water, allWaters, catchState.catches]);

  const relatedTrips = useMemo(() => {
    if (!water) return [];
    const tripIdsFromWaterCatches = new Set(relatedCatches.map((record) => record.tripId).filter(Boolean));
    return tripState.trips.filter((trip) => trip.waterId === water.id || tripIdsFromWaterCatches.has(trip.id));
  }, [water, relatedCatches, tripState.trips]);

  const speciesObserved = useMemo(() => {
    const set = new Set();
    relatedCatches.forEach((c) => {
      if (c.species) set.add(c.species);
    });
    return Array.from(set);
  }, [relatedCatches]);

  const bestCatch = useMemo(() => {
    return relatedCatches
      .filter(isMeasuredCatchWeight)
      .sort((a, b) => b.weightKg - a.weightKg)[0] ?? null;
  }, [relatedCatches]);

  if (loading) {
    return (
      <Layout>
        <div className="water-detail-page">
          <p className="loading-state" role="status">Načítám detail revíru…</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="water-detail-page">
          <section className="water-detail-empty" role="alert">
            <h1>Chyba při načítání</h1>
            <p>{error}</p>
            <Link to="/waters">Zpět na seznam revírů</Link>
          </section>
        </div>
      </Layout>
    );
  }

  if (!water) {
    return (
      <Layout>
        <div className="water-detail-page">
          <header className="water-detail-actions">
            <Link to="/waters" aria-label="Zpět na seznam revírů">←</Link>
          </header>
          <section className="water-detail-empty" aria-labelledby="water-detail-title">
            <p className="water-detail-kicker">REVÍR NENALEZEN</p>
            <h1 id="water-detail-title">Požadovaný revír neexistuje</h1>
            <p>Záznam revíru mohl být smazán nebo máš otevřený jiný profil.</p>
            <Link to="/waters">Zpět na seznam revírů</Link>
          </section>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="water-detail-page">
        <header className="water-detail-actions">
          <Link to="/waters" aria-label="Zpět na seznam revírů">←</Link>
          <button
            type="button"
            aria-label={water.isFavorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
            disabled={favoriteSaving}
            onClick={toggleFavorite}
            style={{ color: water.isFavorite ? "var(--accent-orange)" : "inherit" }}
          >
            {water.isFavorite ? "★" : "☆"}
          </button>
          <Link to={`/waters/${water.id}/chat`} aria-label="Chat revíru" title="Chat revíru">
            💬
          </Link>
        </header>
        {actionError && <p role="alert" className="water-action-error">{actionError}</p>}

        <section className="water-detail-hero">
          <span className="water-detail-kicker">{water.type} · {water.moderationStatus === "verified" ? "Ověřený revír" : "Místní záznam"}</span>
          <h1>{water.name}</h1>
          {water.waterNumber && <p className="water-detail-number">Číslo revíru: <strong>{water.waterNumber}</strong></p>}
          {water.area && <p className="water-detail-area">📍 {water.area}</p>}
        </section>

        <section className="water-detail-stats-grid" aria-label="Statistiky z deníku">
          <div className="water-stat-box">
            <strong>{relatedCatches.length}</strong>
            <span>Úlovků</span>
          </div>
          <div className="water-stat-box">
            <strong>{speciesObserved.length}</strong>
            <span>Druhů ryb</span>
          </div>
          <div className="water-stat-box">
            <strong>{relatedTrips.length}</strong>
            <span>Výprav</span>
          </div>
          <div className="water-stat-box">
            <strong>{bestCatch ? `${bestCatch.weightKg.toLocaleString("cs-CZ")} kg` : "—"}</strong>
            <span>Místní PB</span>
          </div>
        </section>

        {water.notes && (
          <section className="water-detail-notes">
            <h2>Poznámky k revíru</h2>
            <p>{water.notes}</p>
          </section>
        )}

        {speciesObserved.length > 0 && (
          <section className="water-detail-species">
            <h2>Chycené druhy ryb ({speciesObserved.length})</h2>
            <div className="water-species-chips">
              {speciesObserved.map((sp) => (
                <span key={sp} className="water-species-tag">🐟 {sp}</span>
              ))}
            </div>
          </section>
        )}

        {water.targetFish && water.targetFish.length > 0 && (
          <section className="water-detail-species">
            <h2>Cílové druhy v revíru</h2>
            <div className="water-species-chips">
              {water.targetFish.map((fish) => (
                <span key={fish} className="water-species-tag">✓ {fish}</span>
              ))}
            </div>
          </section>
        )}

        <section className="water-detail-catches" aria-labelledby="water-catches-title">
          <h2 id="water-catches-title">Moje úlovky na tomto revíru ({relatedCatches.length})</h2>
          {relatedCatches.length === 0 ? (
            <p className="water-no-catches">Na tomto revíru zatím nemáš zapsaný žádný úlovek.</p>
          ) : (
            <div className="water-catches-list">
              {relatedCatches.map((item) => (
                <CatchCard key={item.id} catchedFish={item} />
              ))}
            </div>
          )}
        </section>

        <section className="water-detail-pending" aria-label="Komunitní vrstva">
          <h2>🌐 Komunitní statistiky</h2>
          <p>Veřejné komunitní heatmapy a sdílené úlovky ostatních rybářů budou dostupné po připojení cloudové synchronizace.</p>
        </section>
      </div>
    </Layout>
  );
}

export default WaterDetailPage;
