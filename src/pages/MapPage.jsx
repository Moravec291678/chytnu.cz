import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { buildPrivateCatchMarkers } from "../features/map/data/catchMap";
import "./MapPage.css";

function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "Datum neuvedeno";
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(new Date(value));
}

function measurement(marker) {
  const values = [];
  if (marker.weightKg !== null) values.push(`${marker.weightKg} kg`);
  if (marker.lengthCm !== null) values.push(`${marker.lengthCm} cm`);
  return values.join(" · ") || "Míry neuvedeny";
}

function popupContent(marker, openDetail) {
  const root = document.createElement("div");
  root.className = "catch-map-popup";
  const title = document.createElement("strong");
  title.textContent = marker.species;
  const details = document.createElement("span");
  details.textContent = `${formatDate(marker.caughtAt)} · ${measurement(marker)}`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Otevřít detail";
  button.addEventListener("click", openDetail);
  root.append(title, details, button);
  return root;
}

function MapPage() {
  const { state } = useCatches();
  const navigate = useNavigate();
  const mapNode = useRef(null);
  const markers = useMemo(() => buildPrivateCatchMarkers(state.catches), [state.catches]);
  const [tileError, setTileError] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (!mapNode.current || markers.length === 0) return undefined;
    let map;
    let active = true;
    try {
      map = L.map(mapNode.current, { scrollWheelZoom: false, zoomControl: true });
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      tiles.on("tileerror", () => { if (active) setTileError(true); });
      tiles.addTo(map);
      const bounds = [];
      markers.forEach((marker) => {
        const point = [marker.latitude, marker.longitude];
        bounds.push(point);
        const circle = L.circleMarker(point, {
          radius: 8, color: "#eff8f0", weight: 2, fillColor: "#4f9a63", fillOpacity: 1,
        });
        circle.bindPopup(popupContent(marker, () => navigate(`/catch/${marker.id}`)));
        circle.bindTooltip(marker.species, { direction: "top" });
        circle.addTo(map);
      });
      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
    } catch {
      queueMicrotask(() => {
        if (active) setMapError("Mapu se nepodařilo zobrazit. Úlovky a jejich souřadnice zůstávají bezpečně uložené v deníku.");
      });
    }
    return () => {
      active = false;
      map?.remove();
    };
  }, [markers, navigate]);

  return <Layout><div className="catch-map-page">
    <header className="catch-map-header">
      <Link to="/profile">← Profil</Link>
      <h1>Soukromá mapa</h1>
      <p>Zobrazuje pouze tvoje úlovky s uloženou GPS polohou. Souřadnice nejsou veřejné.</p>
    </header>
    {state.loading ? <p role="status">Načítám úlovky…</p> : markers.length === 0
      ? <section className="catch-map-empty"><h2>Zatím bez bodů na mapě</h2><p>GPS lze přidat při vytvoření nebo úpravě úlovku. Poloha se nikdy nezískává bez tvé akce.</p></section>
      : <>
        {mapError ? <p className="catch-map-error" role="alert">{mapError}</p> : <div className="catch-map-canvas" ref={mapNode} role="region" aria-label={`Mapa · ${markers.length} ${markers.length === 1 ? "úlovek" : "úlovků"}`} />}
        {tileError && !mapError && <p className="catch-map-note" role="status">Mapový podklad není momentálně dostupný. Uložené body se nezměnily.</p>}
        <p className="catch-map-count">{markers.length} {markers.length === 1 ? "úlovek s polohou" : "úlovků s polohou"}</p>
      </>}
  </div></Layout>;
}

export default MapPage;
