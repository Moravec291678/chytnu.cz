import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { buildTripCatchMarkers, groupNearbyTripMarkers, tripMapViewport } from "../../map/data/tripCatchMap.js";
import { getPhotoBlobForDisplay } from "../../catches/data/photoCloudService.js";
import { startPhotoDelivery } from "../../catches/data/photoDeliveryRetry.js";
import "leaflet/dist/leaflet.css";
import "./TripCatchMap.css";

function timeLabel(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" }) : "Čas neuveden";
}

function measurement(marker) {
  return [marker.lengthCm !== null ? `${marker.lengthCm.toLocaleString("cs-CZ")} cm` : "",
    marker.weightKg !== null ? `${marker.weightKg.toLocaleString("cs-CZ")} kg` : ""].filter(Boolean).join(" · ");
}

function popupContent(markers) {
  const root = document.createElement("div");
  root.className = "trip-map-popup";
  const photos = [];
  for (const marker of markers) {
    const item = document.createElement("div"); item.className = "trip-map-popup-item";
    const title = document.createElement("strong"); title.textContent = `${marker.species}${marker.aiSuggested ? " · Návrh AI" : ""}`;
    const detail = document.createElement("span"); detail.textContent = [timeLabel(marker.caughtAt), measurement(marker)].filter(Boolean).join(" · ");
    const link = document.createElement("a"); link.href = `/catch/${encodeURIComponent(marker.id)}`; link.textContent = "Zobrazit úlovek";
    item.append(title, detail, link);
    if (marker.photo) {
      const img = document.createElement("img"); img.alt = `Fotografie úlovku · ${marker.species}`; img.hidden = true;
      img.addEventListener("error", () => { img.hidden = true; });
      item.prepend(img); photos.push({ marker, img });
    }
    root.append(item);
  }
  return { root, photos };
}

export default function TripCatchMap({ trip, catches }) {
  const scope = useDataScope();
  const markers = useMemo(() => buildTripCatchMarkers(catches, trip, scope), [catches, trip, scope]);
  const mapNode = useRef(null), mapApi = useRef(null), circles = useRef(new Map());
  const [tileError, setTileError] = useState(false), [mapError, setMapError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const connected = () => { if (tileError || mapError) setRetry(value => value + 1); };
    window.addEventListener("online", connected);
    return () => window.removeEventListener("online", connected);
  }, [tileError, mapError]);
  useEffect(() => {
    if (!mapNode.current || markers.length === 0) return undefined;
    let active = true, map;
    const stopPhotos = new Set();
    void (async () => {
      try {
        const { default: L } = await import("leaflet");
        if (!active) return;
        setTileError(false); setMapError(false);
        map = L.map(mapNode.current, { scrollWheelZoom: false }); mapApi.current = map;
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        });
        tiles.on("tileerror", () => { if (active) setTileError(true); });
        tiles.addTo(map);
        circles.current = new Map();
        for (const group of groupNearbyTripMarkers(markers)) {
          for (const marker of group) {
            const circle = L.circleMarker([marker.latitude, marker.longitude], { radius: 9, color: "#effff8", fillColor: "#19c58c", fillOpacity: 1, weight: 2 });
            const popup = popupContent(group);
            circle.bindPopup(popup.root, { maxWidth: 270, maxHeight: 320 });
            circle.bindTooltip(`${marker.species}${group.length > 1 ? ` · ${group.length} úlovků v místě` : ""}`);
            let dispose = () => {};
            circle.on("popupopen", () => {
              dispose();
              const urls = [], stops = [];
              for (const { marker: photoMarker, img } of popup.photos) {
                stops.push(startPhotoDelivery({ maxAutomaticRetries: 1,
                  load: () => getPhotoBlobForDisplay({ photo: photoMarker.photo, ownerId: photoMarker.ownerId, catchId: photoMarker.id, scopeKey: photoMarker.scopeKey }),
                  onState: ({ blob }) => { if (active && blob instanceof Blob) { const url = URL.createObjectURL(blob); urls.push(url); img.src = url; img.hidden = false; } },
                }));
              }
              dispose = () => { for (const stop of stops) stop(); for (const url of urls) URL.revokeObjectURL(url); stopPhotos.delete(dispose); };
              stopPhotos.add(dispose);
            });
            circle.on("popupclose", () => dispose());
            circle.addTo(map); circles.current.set(marker.id, circle);
          }
        }
        const viewport = tripMapViewport(markers);
        if (viewport.center) map.setView(viewport.center, viewport.zoom);
        else map.fitBounds(viewport.bounds, { padding: [28, 28], maxZoom: viewport.maxZoom });
      } catch { if (active) setMapError(true); }
    })();
    return () => { active = false; for (const stop of stopPhotos) stop(); circles.current.clear(); mapApi.current = null; map?.remove(); };
  }, [markers, retry]);
  const focusMarker = marker => {
    const circle = circles.current.get(marker.id);
    if (circle && mapApi.current) { mapApi.current.setView([marker.latitude, marker.longitude], Math.max(mapApi.current.getZoom(), 15)); circle.openPopup(); }
  };
  return <section className="trip-catch-map" aria-labelledby="trip-catch-map-title">
    <h2 id="trip-catch-map-title">Mapa vycházky</h2>
    <p>Soukromá mapa jednotlivých úlovků. Zobrazuje jen uložené polohy této vycházky.</p>
    {markers.length === 0 ? <p className="trip-map-note">Zatím tu nejsou úlovky s použitelnou GPS. Polohu můžeš kdykoliv doplnit v úpravách konkrétního úlovku.</p> : <>
      <div ref={mapNode} className="trip-map-canvas" role="region" aria-label={`Mapa vycházky · ${markers.length} ${markers.length === 1 ? "bod" : markers.length <= 4 ? "body" : "bodů"}`} />
      {(tileError || mapError) && <p className="trip-map-note" role="status">{mapError ? "Mapu se nepodařilo zobrazit." : "Mapový podklad teď není dostupný; dlaždice mohou vyžadovat internet."} Uložené polohy a odkazy zůstávají dostupné níže. <button type="button" onClick={() => setRetry(value => value + 1)}>Načíst mapu znovu</button></p>}
      <details className="trip-map-list" open={tileError || mapError}><summary>Uložené polohy ({markers.length})</summary>
        <ol>{markers.map(marker => <li key={marker.id}>
          <strong>{marker.species}{marker.aiSuggested ? " · Návrh AI" : ""}</strong>
          <span>{[timeLabel(marker.caughtAt), measurement(marker)].filter(Boolean).join(" · ")}</span>
          <span>{marker.latitude.toFixed(6)}, {marker.longitude.toFixed(6)}{marker.accuracyMeters !== null ? ` · přesnost ±${Math.round(marker.accuracyMeters)} m` : ""}</span>
          <div><button type="button" onClick={() => focusMarker(marker)}>Zobrazit bod</button><Link to={`/catch/${encodeURIComponent(marker.id)}`}>Zobrazit úlovek</Link></div>
        </li>)}</ol>
      </details>
    </>}
  </section>;
}
