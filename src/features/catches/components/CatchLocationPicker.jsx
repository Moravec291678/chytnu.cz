import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatCoordinates, normalizeCoordinates } from "../data/coordinates.js";
import { resolveCatchMapStart } from "../data/manualMapLocation.js";
import { useModalFocusTrap } from "../../../shared/hooks/useModalFocusTrap.js";
import "./CatchLocationPicker.css";

function parseInputCoordinates(latitude, longitude) {
  if (!String(latitude).trim() || !String(longitude).trim()) return null;
  return normalizeCoordinates({
    latitude: String(latitude).trim().replace(",", "."),
    longitude: String(longitude).trim().replace(",", "."),
  });
}

export default function CatchLocationPicker({ initialCoordinates, waterCoordinates, onCancel, onConfirm }) {
  const start = resolveCatchMapStart(initialCoordinates, waterCoordinates);
  const [latitudeText, setLatitudeText] = useState(formatCoordinates(start.coordinates).split(",")[0]);
  const [longitudeText, setLongitudeText] = useState(formatCoordinates(start.coordinates).split(",")[1].trim());
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  useModalFocusTrap(dialogRef, { initialFocusRef: closeButtonRef, onEscape: onCancel });

  const setPoint = (point, { pan = false } = {}) => {
    const next = normalizeCoordinates(point);
    if (!next) return;
    setLatitudeText(next.latitude.toFixed(6));
    setLongitudeText(next.longitude.toFixed(6));
    markerRef.current?.setLatLng([next.latitude, next.longitude]);
    if (pan) mapRef.current?.panTo([next.latitude, next.longitude]);
  };
  const setFromInput = (point) => {
    const next = normalizeCoordinates(point);
    if (!next) return;
    markerRef.current?.setLatLng([next.latitude, next.longitude]);
    mapRef.current?.panTo([next.latitude, next.longitude]);
  };

  useEffect(() => {
    const node = mapElementRef.current;
    if (!node) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const map = L.map(node, { zoomControl: true, scrollWheelZoom: false, tap: true })
      .setView([start.coordinates.latitude, start.coordinates.longitude], start.zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const marker = L.marker([start.coordinates.latitude, start.coordinates.longitude], {
      draggable: true,
      title: "Zvolená poloha úlovku",
      alt: "Zvolená poloha úlovku, přetáhni marker nebo klepni na mapu",
      keyboard: true,
      icon: L.divIcon({ className: "catch-location-picker-marker", html: "<span></span>", iconSize: [30, 30], iconAnchor: [15, 15] }),
    }).addTo(map);
    marker.on("dragend", () => setPoint(marker.getLatLng()));
    map.on("click", (event) => setPoint(event.latlng));
    mapRef.current = map;
    markerRef.current = marker;
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      document.body.style.overflow = previousBodyOverflow;
      mapRef.current = null;
      markerRef.current = null;
    };
    // Initial position is intentionally captured when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputCoordinates = parseInputCoordinates(latitudeText, longitudeText);
  const validInput = Boolean(inputCoordinates);
  const confirm = () => {
    if (!validInput) return;
    onConfirm(inputCoordinates);
  };

  return <div className="catch-location-picker-backdrop">
    <section ref={dialogRef} tabIndex="-1" className="catch-location-picker" role="dialog" aria-modal="true" aria-labelledby="catch-location-picker-title">
      <header className="catch-location-picker-header">
        <div>
          <h2 id="catch-location-picker-title">Poloha úlovku</h2>
          <p>Posuň mapu, klepni na místo nebo uprav souřadnice.</p>
        </div>
        <button ref={closeButtonRef} type="button" className="catch-location-picker-close" onClick={onCancel} aria-label="Zrušit výběr polohy">×</button>
      </header>
      <div ref={mapElementRef} className="catch-location-picker-map" role="region" aria-label="Mapa pro výběr polohy úlovku" />
      <div className="catch-location-picker-coordinates">
        <label>
          <span>Zeměpisná šířka</span>
          <input aria-label="Zeměpisná šířka" inputMode="decimal" value={latitudeText} onChange={(event) => {
            const value = event.target.value;
            setLatitudeText(value);
            const parsed = parseInputCoordinates(value, longitudeText);
            if (parsed) setFromInput(parsed);
          }} />
        </label>
        <label>
          <span>Zeměpisná délka</span>
          <input aria-label="Zeměpisná délka" inputMode="decimal" value={longitudeText} onChange={(event) => {
            const value = event.target.value;
            setLongitudeText(value);
            const parsed = parseInputCoordinates(latitudeText, value);
            if (parsed) setFromInput(parsed);
          }} />
        </label>
      </div>
      <p className="catch-location-picker-value" aria-live="polite">{validInput ? formatCoordinates(inputCoordinates) : "Zadej platné souřadnice."}</p>
      <footer className="catch-location-picker-actions">
        <button type="button" className="catch-location-picker-cancel" onClick={onCancel}>Zrušit</button>
        <button type="button" className="catch-location-picker-confirm" onClick={confirm} disabled={!validInput}>Použít tuto polohu</button>
      </footer>
    </section>
  </div>;
}
