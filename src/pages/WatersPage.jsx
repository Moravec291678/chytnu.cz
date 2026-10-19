import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { filterWaters } from "../features/waters/data/waterModel.js";
import "./WatersPage.css";

function WatersPage() {
  const scope = useDataScope();
  const [waters, setWaters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [favoriteSavingId, setFavoriteSavingId] = useState(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all"); // "all" | "favorites"

  const loadWaters = useCallback(async () => {
    if (scope.status !== "ready") return;
    setLoading(true);
    setError("");
    try {
      const data = await waterRepository.list(scope);
      setWaters(data);
    } catch (err) {
      setError(err?.message || "Revíry se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void Promise.resolve().then(loadWaters);
  }, [loadWaters]);

  const toggleFavorite = async (event, water) => {
    event.preventDefault();
    event.stopPropagation();
    if (favoriteSavingId) return;
    setFavoriteSavingId(water.id);
    setActionError("");
    try {
      const updated = { ...water, isFavorite: !water.isFavorite };
      await waterRepository.put(updated, scope);
      setWaters((prev) => prev.map((w) => (w.id === water.id ? updated : w)));
    } catch (favoriteError) {
      setActionError(favoriteError?.message || "Oblíbený revír se nepodařilo uložit.");
    } finally {
      setFavoriteSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    return filterWaters(waters, {
      query: search,
      favoriteOnly: tab === "favorites",
    });
  }, [waters, search, tab]);

  return (
    <Layout>
      <div className="waters-page">
        <header className="waters-header">
          <div>
            <h1>Revíry</h1>
            <p>Moje revíry a vody ({waters.length})</p>
          </div>
          <Link to="/waters/new" className="waters-add-btn" aria-label="Přidat revír">＋</Link>
        </header>

        <label className="waters-search">
          <input
            type="search"
            aria-label="Hledat revír"
            placeholder="Hledat revír podle názvu, čísla nebo ryb…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="waters-tabs" role="tablist" aria-label="Výběr revírů">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "all"}
            onClick={() => setTab("all")}
          >
            Všechny ({waters.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "favorites"}
            onClick={() => setTab("favorites")}
          >
            Oblíbené ({waters.filter((w) => w.isFavorite).length})
          </button>
          <Link to="/hotspots" className="waters-tab-link" role="tab">
            Hotspoty
          </Link>
        </div>
        {actionError && <p role="alert" className="water-action-error">{actionError}</p>}

        {loading ? (
          <p className="loading-state" role="status">Načítám revíry…</p>
        ) : error ? (
          <section className="waters-empty" role="alert">
            <h2>Chyba při načítání</h2>
            <p>{error}</p>
            <button type="button" onClick={loadWaters}>Zkusit znovu</button>
          </section>
        ) : waters.length === 0 ? (
          <section className="waters-empty" aria-labelledby="waters-empty-title">
            <h2 id="waters-empty-title">Zatím nemáš uložené žádné revíry</h2>
            <p>Přidej svůj první revír a sleduj na něm úlovky, poznámky a návštěvy.</p>
            <Link to="/waters/new">Přidat první revír</Link>
          </section>
        ) : filtered.length === 0 ? (
          <section className="waters-empty">
            <h2>Žádný revír neodpovídá hledání</h2>
            <p>Zkus upravit vyhledávací dotaz nebo přepnout filtr.</p>
            <button type="button" onClick={() => { setSearch(""); setTab("all"); }}>Zobrazit všechny</button>
          </section>
        ) : (
          <div className="waters-list" role="feed" aria-label="Seznam revírů">
            {filtered.map((water) => (
              <article key={water.id} className="water-card">
                <Link to={`/waters/${water.id}`} className="water-card-link">
                  <div className="water-card-info">
                    <span className="water-card-type">{water.type}</span>
                    <h2>{water.name}</h2>
                    {water.waterNumber && <span className="water-card-number">Číslo: {water.waterNumber}</span>}
                    {water.area && <p className="water-card-area">{water.area}</p>}
                    {water.targetFish && water.targetFish.length > 0 && (
                      <p className="water-card-fish">Ryby: {water.targetFish.join(", ")}</p>
                    )}
                  </div>
                </Link>
                <button
                  type="button"
                  className={`water-card-fav${water.isFavorite ? " is-favorite" : ""}`}
                  aria-label={water.isFavorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
                  disabled={favoriteSavingId === water.id}
                  onClick={(e) => toggleFavorite(e, water)}
                >
                  {water.isFavorite ? "★" : "☆"}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default WatersPage;
