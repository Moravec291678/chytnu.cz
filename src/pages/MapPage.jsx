import { useEffect, useMemo, useRef, useState } from "react";
import CatchMeasurements from "../features/catches/components/CatchMeasurements.jsx";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import Layout from "../shared/layout/Layout";
import { formatCatchMeasurements } from "../features/catches/data/catchWeight.js";
import { useCatches } from "../features/catches/context/useCatches";
import { buildPrivateCatchMarkers, groupVisibleCatchMarkers } from "../features/map/data/catchMap";
import "./MapPage.css";

const mapDateFormatter = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" });

function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "Datum neuvedeno";
  return mapDateFormatter.format(new Date(value));
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
  return formatCatchMeasurements(marker) || "Míry neuvedeny";
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

const POPUP_PAGE_SIZE = 20;

function groupPopupContent(group, openDetail) {
  const root = document.createElement("div");
  root.className = "catch-map-popup";
  function showPage(offset, focus) {
    const heading = document.createElement("strong");
    heading.textContent = locatedCatchCountLabel(group.length);
    root.replaceChildren(heading);
    for (const marker of group.slice(offset, offset + POPUP_PAGE_SIZE)) {
      root.append(popupContent(marker, () => openDetail(marker.id)));
    }
    for (const [target, label] of [[offset - POPUP_PAGE_SIZE, "Předchozí úlovky"], [offset + POPUP_PAGE_SIZE, "Další úlovky"]]) {
      if (target < 0 || target >= group.length) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => showPage(target, true));
      root.append(button);
    }
    if (focus) root.querySelector("button")?.focus();
  }
  showPage(0, false);
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
  const [mapRetry, setMapRetry] = useState(0);

  const mapActions = useRef(null);
  const selection = useRef(null);
  useEffect(() => {
    selection.current = { selectedMarker, navigate, setSearchParams };
    if (selectedMarker) mapActions.current?.focusCatch(selectedMarker);
  }, [selectedMarker, navigate, setSearchParams]);

  useEffect(() => {
    const node = mapNode.current;
    if (!node || markers.length === 0) return undefined;
    let map;
    let frame;
    let active = true;
    void import("leaflet").then(({ default: L }) => {
      if (!active) return;
      setTileError(false);
      map = L.map(node, { scrollWheelZoom: false, zoomControl: true });
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      tiles.on("tileerror", () => { if (active) setTileError(true); });
      tiles.addTo(map);

      const layers = L.layerGroup().addTo(map);
      const styles = getComputedStyle(document.documentElement);
      const border = styles.getPropertyValue("--map-marker-border").trim();
      const regular = styles.getPropertyValue("--map-marker-fill").trim();
      const record = styles.getPropertyValue("--accent-orange").trim();
      const openDetail = id => selection.current.navigate(`/catch/${encodeURIComponent(id)}`);
      let focusedId = null;
      const openPopup = (point, content) => L.popup({ maxHeight: 220 })
        .setLatLng(point).setContent(content).openOn(map);
      const focusCatch = (marker, center = true) => {
        if (focusedId === marker.id) return;
        focusedId = marker.id;
        const point = [marker.latitude, marker.longitude];
        if (center) map.setView(point, Math.max(14, map.getZoom() || 0));
        return openPopup(point, popupContent(marker, () => openDetail(marker.id)));
      };
      mapActions.current = { focusCatch };

      const renderMarkers = () => {
        layers.clearLayers();
        const groups = groupVisibleCatchMarkers(markers, point => map.latLngToContainerPoint(point), map.getSize());
        for (const group of groups) {
          const marker = group[0], clustered = group.length > 1;
          const point = [marker.latitude, marker.longitude];
          const circle = L.circleMarker(point, {
            radius: clustered ? 13 : 8, color: border, weight: clustered ? 3 : 2,
            fillColor: group.some(item => item.isPersonalRecord) ? record : regular, fillOpacity: 1,
          }).addTo(layers);
          const label = clustered ? locatedCatchCountLabel(group.length) : marker.species;
          const tooltip = document.createElement("span");
          tooltip.textContent = label;
          circle.bindTooltip(tooltip, { direction: "top" });
          const select = (keyboard = false) => {
            if (clustered) {
              focusedId = null;
              const popup = openPopup(point, groupPopupContent(group, openDetail));
              if (keyboard) popup.getElement()?.querySelector("button")?.focus({ preventScroll: true });
              return;
            }
            focusedId = null;
            const popup = focusCatch(marker, false);
            if (keyboard) popup?.getElement()?.querySelector("button")?.focus({ preventScroll: true });
            selection.current.setSearchParams({ catch: marker.id }, { replace: true });
          };
          circle.on("click", () => select());
          const element = circle.getElement();
          element?.setAttribute("tabindex", "0");
          element?.setAttribute("role", "button");
          element?.setAttribute("aria-label", label);
          element?.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            select(true);
          });
        }
      };
      const scheduleRender = () => {
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(renderMarkers);
      };

      const initial = selection.current.selectedMarker;
      if (initial) focusCatch(initial);
      else if (markers.length === 1) map.setView([markers[0].latitude, markers[0].longitude], 13);
      else map.fitBounds(markers.map(marker => [marker.latitude, marker.longitude]), { padding: [28, 28], maxZoom: 14 });
      renderMarkers();
      map.on("moveend zoomend resize", scheduleRender);
    }).catch(() => {
      if (active) setMapError("Mapu se nepodařilo zobrazit. Úlovky a jejich souřadnice zůstávají bezpečně uložené v deníku.");
    });
    return () => {
      active = false;
      mapActions.current = null;
      if (frame !== undefined) cancelAnimationFrame(frame);
      map?.remove();
    };
  }, [markers, state.loading, state.error, mapRetry]);

  const retryMap = () => { setMapError(""); setTileError(false); setMapRetry((value) => value + 1); };

  return <Layout><div className="catch-map-page">
    <header className="catch-map-header">
      <h1>Soukromá mapa</h1>
      <p>{state.loading ? "Načítám úlovky…" : catchCountLabel(markers.length)}</p>
      <p className="catch-map-privacy">Soukromá mapa — zobrazuje jen tvoje úlovky s uloženou GPS polohou. Souřadnice nejsou veřejné.</p>
      <Link to="/hotspots">Přehled míst úlovků</Link>
    </header>
    {state.loading ? <p className="loading-state" role="status">Načítám úlovky…</p> : state.error
      ? <section className="catch-map-empty" role="alert"><h2>Úlovky se nepodařilo načíst</h2><p>{state.error}</p><button type="button" onClick={refresh}>Zkusit znovu</button></section>
      : markers.length === 0
      ? <section className="catch-map-empty"><h2>Zatím bez bodů na mapě</h2><p>GPS lze přidat při vytvoření nebo úpravě úlovku. Poloha se nikdy nezískává bez tvé akce.</p></section>
      : <>
        {mapError ? <div className="catch-map-error" role="alert"><p>{mapError}</p><button type="button" onClick={retryMap}>Zkusit znovu</button></div> : <div className="catch-map-canvas" ref={mapNode} role="region" aria-label={`Mapa · ${markers.length} ${markers.length === 1 ? "úlovek" : "úlovků"}`} />}
        {tileError && !mapError && <p className="catch-map-note" role="status">Mapový podklad není momentálně dostupný. Uložené body se nezměnily. <button type="button" onClick={retryMap}>Načíst znovu</button></p>}
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
            <CatchMeasurements record={selectedMarker} size="compact" />
            {!Number.isFinite(selectedMarker.weightKg) && !Number.isFinite(selectedMarker.lengthCm) && <small>Míry neuvedeny</small>}
          </span>
        </Link>}
      </>}
  </div></Layout>;
}

export default MapPage;
