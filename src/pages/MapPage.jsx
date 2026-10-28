import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Layout from "../shared/layout/Layout";
import { formatCatchWeight } from "../features/catches/data/catchWeight.js";
import { useCatches } from "../features/catches/context/useCatches";
import { buildPrivateCatchMarkers } from "../features/map/data/catchMap";
import "./MapPage.css";

function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "Datum neuvedeno";
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(new Date(value));
}

function catchCountLabel(count) {
  const word = count === 1 ? "úlovek" : count >= 2 && count <= 4 ? "úlovky" : "úlovků";
  return `${count} ${word} na mapě`;
}

function locatedCatchCountLabel(count) {
  const word = count === 1 ? "úlovek" : count >= 2 && count <= 4 ? "úlovky" : "úlovků";
  return `${count} ${word} s polohou`;
}

function measurement(marker) {
  const values = [];
  if (marker.lengthCm !== null) values.push(`${marker.lengthCm.toLocaleString("cs-CZ")} cm`);
  if (marker.weightKg !== null) values.push(`${marker.weightKg.toLocaleString("cs-CZ")} kg`);
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
  const { state, refresh } = useCatches();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCatchId = searchParams.get("catch");
  const mapNode = useRef(null);
  const markers = useMemo(() => buildPrivateCatchMarkers(state.catches), [state.catches]);
  const selectedMarker = markers.find((marker) => marker.id === selectedCatchId);
  const [tileError, setTileError] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (!mapNode.current || markers.length === 0) return undefined;
    let map;
    let active = true;
    setTileError(false);
    try {
      map = L.map(mapNode.current, { scrollWheelZoom: false, zoomControl: true });
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      tiles.on("tileerror", () => { if (active) setTileError(true); });
      tiles.addTo(map);
      const bounds = [];
      const mapStyles = getComputedStyle(document.documentElement);
      let selectedMarker;
      markers.forEach((marker) => {
        const point = [marker.latitude, marker.longitude];
        bounds.push(point);
        const circle = L.circleMarker(point, {
          radius: 8,
          color: mapStyles.getPropertyValue("--map-marker-border").trim(),
          weight: 2,
          fillColor: marker.isPersonalRecord
            ? mapStyles.getPropertyValue("--accent-orange").trim()
            : mapStyles.getPropertyValue("--map-marker-fill").trim(),
          fillOpacity: 1,
        });
        circle.bindPopup(popupContent(marker, () => navigate(`/catch/${marker.id}`)));
        circle.bindTooltip(marker.species, { direction: "top" });
        circle.on("click", () => setSearchParams({ catch: marker.id }, { replace: true }));
        circle.addTo(map);
        if (marker.id === selectedCatchId) selectedMarker = { circle, point };
      });
      if (selectedMarker) {
        map.setView(selectedMarker.point, 14);
        selectedMarker.circle.openPopup();
      } else if (bounds.length === 1) map.setView(bounds[0], 13);
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
  }, [markers, navigate, selectedCatchId, setSearchParams]);

  return <Layout><div className="catch-map-page">
    <header className="catch-map-header">
      <h1>Deník</h1>
      <p>{state.loading ? "Načítám úlovky…" : catchCountLabel(markers.length)}</p>
      <nav className="catch-map-tabs" aria-label="Zobrazení deníku">
        <Link to="/journal">Seznam</Link>
        <Link to="/journal/map" aria-current="page">Mapa</Link>
        <Link to="/journal/calendar">Kalendář</Link>
      </nav>
      <p className="catch-map-privacy">Soukromá mapa — zobrazuje jen tvoje úlovky s uloženou GPS polohou. Souřadnice nejsou veřejné.</p>
    </header>
    {state.loading ? <p className="loading-state" role="status">Načítám úlovky…</p> : state.error
      ? <section className="catch-map-empty" role="alert"><h2>Úlovky se nepodařilo načíst</h2><p>{state.error}</p><button type="button" onClick={refresh}>Zkusit znovu</button></section>
      : markers.length === 0
      ? <section className="catch-map-empty"><h2>Zatím bez bodů na mapě</h2><p>GPS lze přidat při vytvoření nebo úpravě úlovku. Poloha se nikdy nezískává bez tvé akce.</p></section>
      : <>
        {mapError ? <p className="catch-map-error" role="alert">{mapError}</p> : <div className="catch-map-canvas" ref={mapNode} role="region" aria-label={`Mapa · ${markers.length} ${markers.length === 1 ? "úlovek" : "úlovků"}`} />}
        {tileError && !mapError && <p className="catch-map-note" role="status">Mapový podklad není momentálně dostupný. Uložené body se nezměnily.</p>}
        <p className="catch-map-count">{locatedCatchCountLabel(markers.length)}</p>
        <div className="catch-map-legend" aria-label="Legenda mapy">
          <span><i className="catch-map-legend-record" />Osobní rekord</span>
          <span><i className="catch-map-legend-catch" />Úlovek</span>
        </div>
        {selectedMarker && <Link className="catch-map-record" to={`/catch/${selectedMarker.id}`}>
          <span className="catch-map-record-icon" aria-hidden="true">
            <svg viewBox="0 0 40 28"><path d="M4 14c5-7 13-10 22-7l9-5v24l-9-5C17 24 9 21 4 14Z" /></svg>
          </span>
          <span className="catch-map-record-info">
            <strong>{selectedMarker.species}</strong>
            <span>{formatDate(selectedMarker.caughtAt)}{selectedMarker.locationName ? ` · ${selectedMarker.locationName}` : ""}</span>
            <span className="catch-map-record-badges">
              {selectedMarker.isPersonalRecord && <span className="catch-map-record-badge-record">Osobní rekord</span>}
              {selectedMarker.result === "released" && <span className="catch-map-record-badge-release">Puštěno</span>}
              {selectedMarker.result === "kept" && <span className="catch-map-record-badge-kept">Ponecháno</span>}
            </span>
          </span>
          <span className="catch-map-record-measure">
            {Number.isFinite(selectedMarker.lengthCm) && <small>{selectedMarker.lengthCm.toLocaleString("cs-CZ")} cm</small>}
            {Number.isFinite(selectedMarker.weightKg) && <><strong>{formatCatchWeight(selectedMarker)}</strong><small>kg</small></>}
            {!Number.isFinite(selectedMarker.weightKg) && !Number.isFinite(selectedMarker.lengthCm) && <small>Míry neuvedeny</small>}
          </span>
        </Link>}
      </>}
  </div></Layout>;
}

export default MapPage;
