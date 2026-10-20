import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { buildLocalHeatmap, buildSpeciesHotspots, buildWaterHotspots } from "../features/waters/data/hotspotStats.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import Layout from "../shared/layout/Layout";
import "./HotspotsPage.css";

function catchCountLabel(count) {
  if (count === 1) return "1 úlovek";
  if (count >= 2 && count <= 4) return `${count} úlovky`;
  return `${count} úlovků`;
}

function formatDate(value) {
  if (!Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function EmptyState({ children }) {
  return <p className="hotspots-empty">{children}</p>;
}

function HotspotsPage() {
  const scope = useDataScope();
  const { state: catchState } = useCatches();
  const [tab, setTab] = useState("hotspots");
  const [waters, setWaters] = useState([]);
  const [watersError, setWatersError] = useState("");

  useEffect(() => {
    let active = true;
    if (scope.status !== "ready") return () => { active = false; };
    waterRepository.list(scope)
      .then((records) => {
        if (!active) return;
        setWaters(records);
        setWatersError("");
      })
      .catch((error) => {
        if (!active) return;
        setWaters([]);
        setWatersError(error?.message || "Uložené revíry se nepodařilo načíst.");
      });
    return () => { active = false; };
  }, [scope]);

  const waterHotspots = useMemo(() => buildWaterHotspots(catchState.catches, waters), [catchState.catches, waters]);
  const heatCells = useMemo(() => buildLocalHeatmap(catchState.catches), [catchState.catches]);
  const speciesHotspots = useMemo(() => buildSpeciesHotspots(catchState.catches, waters), [catchState.catches, waters]);
  const maximumHeatCount = heatCells[0]?.catchCount ?? 0;

  return (
    <Layout>
      <div className="hotspots-page">
        <header className="hotspots-header">
          <h1>Hotspoty</h1>
          <p>Soukromé agregace pouze z úlovků v tomto profilu</p>
          <span>PRIVATE · LOCAL DATA</span>
        </header>

        <div className="hotspots-tabs" role="tablist" aria-label="Zobrazení hotspotů">
          <button type="button" role="tab" aria-selected={tab === "hotspots"} onClick={() => setTab("hotspots")}>Hotspoty</button>
          <button type="button" role="tab" aria-selected={tab === "heatmap"} onClick={() => setTab("heatmap")}>Heatmap</button>
          <button type="button" role="tab" aria-selected={tab === "species"} onClick={() => setTab("species")}>Druh</button>
        </div>

        {catchState.loading ? (
          <p className="loading-state" role="status">Načítám vlastní úlovky…</p>
        ) : catchState.error ? (
          <section className="hotspots-state" role="alert"><strong>Data se nepodařilo načíst</strong><p>{catchState.error}</p></section>
        ) : tab === "heatmap" ? (
          <section className="hotspots-section" aria-labelledby="local-heatmap-title">
            <div className="hotspots-section-heading">
              <div><span>VLASTNÍ GPS AGREGACE</span><h2 id="local-heatmap-title">Lokální heatmapa</h2></div>
              <Link to="/map">Soukromá mapa →</Link>
            </div>
            <p className="hotspots-explanation">Blízké GPS body jsou sloučené do oblastí. Přesné souřadnice se zde nezobrazují.</p>
            {heatCells.length === 0 ? (
              <EmptyState>V tomto profilu zatím není žádný úlovek s platnou GPS polohou.</EmptyState>
            ) : (
              <div className="heatmap-list">
                {heatCells.map((cell, index) => (
                  <article className="heatmap-row" key={cell.key}>
                    <div className="heatmap-row-copy">
                      <strong>Oblast {index + 1}</strong>
                      <span>{catchCountLabel(cell.catchCount)} · {cell.speciesCount} {cell.speciesCount === 1 ? "druh" : "druhů"}</span>
                    </div>
                    <div className="heatmap-meter" aria-label={`Relativní aktivita ${cell.catchCount} úlovků`}>
                      <span style={{ width: `${Math.max(12, (cell.catchCount / maximumHeatCount) * 100)}%` }} />
                    </div>
                    {formatDate(cell.lastCatchAt) && <time dateTime={cell.lastCatchAt}>{formatDate(cell.lastCatchAt)}</time>}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : tab === "species" ? (
          <section className="hotspots-section" aria-labelledby="species-hotspots-title">
            <div className="hotspots-section-heading"><div><span>VLASTNÍ ÚLOVKY</span><h2 id="species-hotspots-title">Aktivita podle druhu</h2></div></div>
            {speciesHotspots.length === 0 ? (
              <EmptyState>Zatím nemáš úlovek s uvedeným druhem ryby.</EmptyState>
            ) : (
              <div className="hotspots-list">
                {speciesHotspots.map((species, index) => (
                  <article className="hotspot-card" key={species.key}>
                    <span className="hotspot-rank">#{index + 1}</span>
                    <div className="hotspot-main">
                      <strong>{species.name}</strong>
                      <span>{species.waterCount} {species.waterCount === 1 ? "revír" : species.waterCount >= 2 && species.waterCount <= 4 ? "revíry" : "revírů"}</span>
                      {species.bestWeightKg !== null && <small>Nejvyšší známá váha: {species.bestWeightKg.toLocaleString("cs-CZ")} kg</small>}
                    </div>
                    <b>{catchCountLabel(species.catchCount)}</b>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="hotspots-section" aria-labelledby="water-hotspots-title">
            <div className="hotspots-section-heading"><div><span>TOP WATERS · VLASTNÍ DATA</span><h2 id="water-hotspots-title">Moje nejúspěšnější revíry</h2></div></div>
            {watersError && <p className="hotspots-warning" role="status">{watersError} Názvy se berou přímo z úlovků.</p>}
            {waterHotspots.length === 0 ? (
              <EmptyState>Zatím nemáš úlovek s uvedeným revírem nebo lokalitou.</EmptyState>
            ) : (
              <div className="hotspots-list">
                {waterHotspots.map((water, index) => (
                  <article className="hotspot-card" key={water.key}>
                    <span className="hotspot-rank">#{index + 1}</span>
                    <div className="hotspot-main">
                      {water.waterId ? <Link to={`/waters/${water.waterId}`}>{water.name}</Link> : <strong>{water.name}</strong>}
                      {water.species.length > 0 && <span>{water.species.slice(0, 3).join(", ")}{water.species.length > 3 ? ` +${water.species.length - 3}` : ""}</span>}
                      {formatDate(water.lastCatchAt) && <small>Poslední úlovek {formatDate(water.lastCatchAt)}</small>}
                    </div>
                    <b>{catchCountLabel(water.catchCount)}</b>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <aside className="hotspots-backend-state" aria-label="Stav komunitních hotspotů">
          <span>BACKEND_REQUIRED</span>
          <strong>Komunitní agregace není dostupná</strong>
          <p>Bez produkčního agregačního backendu se nepoužívají cizí úlovky ani jejich GPS. Tato stránka pracuje jen s vlastními lokálními záznamy.</p>
        </aside>
      </div>
    </Layout>
  );
}

export default HotspotsPage;
