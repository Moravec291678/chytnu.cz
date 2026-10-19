import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches.js";
import "./HotspotsPage.css";

function HotspotsPage() {
  const { state: catchState } = useCatches();
  const [tab, setTab] = useState("ranking"); // "ranking" | "recent" | "heatmap"

  const [now] = useState(() => Date.now());
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Aggregate own catches by locationName
  const locationStats = useMemo(() => {
    const map = new Map();
    for (const item of catchState.catches) {
      const loc = (item.locationName || "").trim();
      if (!loc) continue;
      const existing = map.get(loc) ?? {
        name: loc,
        catches: [],
        speciesSet: new Set(),
        lastCatchAt: null,
      };
      existing.catches.push(item);
      if (item.species) existing.speciesSet.add(item.species);
      const time = Date.parse(item.caughtAt);
      if (Number.isFinite(time) && (!existing.lastCatchAt || time > Date.parse(existing.lastCatchAt))) {
        existing.lastCatchAt = item.caughtAt;
      }
      map.set(loc, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.catches.length - a.catches.length);
  }, [catchState.catches]);

  const recent7DaysLocations = useMemo(() => {
    const map = new Map();
    for (const item of catchState.catches) {
      const loc = (item.locationName || "").trim();
      const time = Date.parse(item.caughtAt);
      if (!loc || !Number.isFinite(time) || time < sevenDaysAgo) continue;
      const count = map.get(loc) ?? 0;
      map.set(loc, count + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [catchState.catches, sevenDaysAgo]);

  return (
    <Layout>
      <div className="hotspots-page">
        <header className="hotspots-header">
          <h1>Kde se chytá</h1>
          <p>Přehled úspěšných revírů z tvých vlastních záznamů</p>
        </header>

        <div className="hotspots-tabs" role="tablist" aria-label="Zobrazení aktivity revírů">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "ranking"}
            onClick={() => setTab("ranking")}
          >
            Všechny revíry
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "recent"}
            onClick={() => setTab("recent")}
          >
            Posledních 7 dní
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "heatmap"}
            onClick={() => setTab("heatmap")}
          >
            Mapa / Heatmapa
          </button>
        </div>

        {tab === "heatmap" ? (
          <section className="hotspots-map" aria-label="Mapa a soukromí">
            <p>Soukromá mapa úlovků</p>
            <p>Tvoje úlovky se souřadnicemi si můžeš prohlédnout na soukromé mapě.</p>
            <Link
              to="/map"
              style={{
                display: "inline-block",
                marginTop: "16px",
                padding: "12px 20px",
                background: "var(--accent-green)",
                color: "var(--text-on-accent)",
                borderRadius: "var(--radius-md)",
                fontWeight: "800",
                textDecoration: "none",
              }}
            >
              Otevřít soukromou mapu
            </Link>
            <p style={{ marginTop: "16px", fontSize: "12px", color: "var(--text-muted)" }}>
              Veřejná anonymizovaná komunitní heatmapa bude dostupná po připojení cloudového backendu s agregací dat.
            </p>
          </section>
        ) : tab === "recent" ? (
          <section className="hotspots-ranking" aria-labelledby="hotspots-recent-title">
            <h2 id="hotspots-recent-title">Aktivita za posledních 7 dní</h2>
            {recent7DaysLocations.length === 0 ? (
              <p>V posledních 7 dnech nemáš zaznamenaný žádný úlovek s uvedeným revírem.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {recent7DaysLocations.map(({ name, count }, index) => (
                  <div
                    key={name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px",
                      background: "var(--surface-1)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "16px", color: "var(--text-primary)" }}>
                        #{index + 1} {name}
                      </strong>
                    </div>
                    <span style={{ fontWeight: "900", color: "var(--accent-green)" }}>
                      {count} {count === 1 ? "úlovek" : count < 5 ? "úlovky" : "úlovků"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="hotspots-ranking" aria-labelledby="hotspots-ranking-title">
            <h2 id="hotspots-ranking-title">Moje nejúspěšnější revíry</h2>
            {locationStats.length === 0 ? (
              <p>Zatím nemáš v deníku žádné úlovky s uvedenou lokalitou. Přidej úlovek a zadej název revíru.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {locationStats.map((loc, index) => (
                  <div
                    key={loc.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px",
                      background: "var(--surface-1)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "16px", color: "var(--text-primary)" }}>
                        #{index + 1} {loc.name}
                      </strong>
                      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
                        Druhy: {Array.from(loc.speciesSet).slice(0, 3).join(", ")}
                        {loc.speciesSet.size > 3 ? ` +${loc.speciesSet.size - 3}` : ""}
                      </p>
                    </div>
                    <span style={{ fontWeight: "900", color: "var(--accent-orange)" }}>
                      {loc.catches.length} {loc.catches.length === 1 ? "úlovek" : loc.catches.length < 5 ? "úlovky" : "úlovků"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}

export default HotspotsPage;
