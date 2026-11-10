import { useEffect, useRef, useState } from "react";
import { risCatalogue } from "../data/risCatalogue.js";
import { waterPoint, publicWaterMapLinks } from "../data/waterLocation.js";
import { distanceBetweenCoordinatesMeters } from "../data/nearbyWaterMatch.js";
import { useWaterPosition } from "./useWaterPosition.js";
import "leaflet/dist/leaflet.css";
import "./CatalogueWaterMap.css";

export default function CatalogueWaterMap({ catalogueId, row }) {
  const [stored,setStored]=useState(null);
  useEffect(()=>{if(row || !catalogueId)return undefined;let live=true;risCatalogue.list().then(rows=>{if(live)setStored({id:catalogueId,row:rows.find(value=>value.id === catalogueId) ?? null});}).catch(()=>{if(live)setStored({id:catalogueId,row:null});});return()=>{live=false;};},[catalogueId,row]);
  const water=row ?? (stored?.id === catalogueId ? stored.row : null);
  if(!water)return catalogueId && stored?.id !== catalogueId ? <p role="status">Načítám veřejný bod revíru…</p> : <p>Veřejný mapový bod není dostupný v místní cache. Otevři detail katalogu po připojení.</p>;
  const point=waterPoint(water.detail?.coordinates ?? water.coordinates);
  return point ? <PointMap key={water.id} water={water} point={point} /> : <p>Souřadnice tohoto revíru nejsou ve zdroji uvedeny. Polohu ani hranice nedopočítáváme.</p>;
}
function PointMap({water,point}) {
  const node=useRef(null), mapRef=useRef(null), [error,setError]=useState(""), [retry,setRetry]=useState(0), [ready,setReady]=useState(0), position=useWaterPosition();
  const links=publicWaterMapLinks(point), lat=point.latitude,lon=point.longitude;
  useEffect(()=>{
    let live=true,map;
    void import("leaflet").then(({default:L})=>{
      if(!live)return;
      map=L.map(node.current,{scrollWheelZoom:false}).setView([lat,lon],13);mapRef.current={map,L};
      const label=document.createElement("span");label.textContent=`${water.number} · ${water.name} — bod RIS, nikoli hranice revíru`;
      L.circleMarker([lat,lon],{radius:10,color:"#effff8",fillColor:"#19c58c",fillOpacity:1,weight:2}).addTo(map).bindPopup(label).openPopup();
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on("tileerror",()=>{if(live)setError("Mapový podklad není dostupný. Bod a souřadnice zůstávají platné; podklad vyžaduje připojení.");}).addTo(map);
      setReady(value=>value+1);
    }).catch(()=>{if(live)setError("Mapu se nepodařilo načíst. Použij souřadnice nebo externí mapu.");});
    return()=>{live=false;mapRef.current=null;map?.remove();};
  },[lat,lon,water.name,water.number,retry]);
  useEffect(()=>{
    if(!position.evidence || !mapRef.current)return undefined;
    const {map,L}=mapRef.current,{coordinates,accuracyMeters}=position.evidence;
    const marker=L.circleMarker([coordinates.latitude,coordinates.longitude],{radius:7,color:"#cce7ff",fillColor:"#537cfa",fillOpacity:1}).addTo(map);
    const label=document.createElement("span");label.textContent=`Tvoje poloha · přesnost ±${Math.round(accuracyMeters)} m`;marker.bindPopup(label);
    const accuracy=L.circle([coordinates.latitude,coordinates.longitude],{radius:accuracyMeters,color:"#537cfa",fillOpacity:0.08,weight:1}).addTo(map);
    map.fitBounds([[lat,lon],[coordinates.latitude,coordinates.longitude]],{padding:[32,32],maxZoom:15});
    return()=>{if(mapRef.current?.map === map){map.removeLayer(marker);map.removeLayer(accuracy);}};
  },[position.evidence,lat,lon,ready]);
  const distance=position.evidence ? distanceBetweenCoordinatesMeters(point,position.evidence.coordinates) : null;
  return <section className="catalogue-water-map" aria-label={`Mapa revíru ${water.name}`}><h2>Mapa revíru</h2><p>{water.name} · č. {water.number}</p>
    <p>Oficiální bod RIS ({lat}, {lon}), nikoli hranice vody. Podklad poskytuje OpenStreetMap; porovnání GPS probíhá v zařízení.</p>
    <div ref={node} className="catalogue-water-map-canvas" role="region" aria-label="Interaktivní mapa referenčního bodu RIS" />
    {error && <p role="status">{error} <button type="button" onClick={()=>{setError("");setRetry(value=>value+1);}}>Obnovit mapu</button></p>}
    <div className="catalogue-water-map-actions"><button type="button" onClick={()=>mapRef.current?.map.setView([lat,lon],15)}>Zobrazit na mapě</button><a href={links.osm} target="_blank" rel="noopener noreferrer">Otevřít v OpenStreetMap ↗</a><a href={links.navigation} target="_blank" rel="noopener noreferrer">Navigovat k bodu revíru ↗</a>
    <button type="button" disabled={position.status === "loading"} onClick={()=>void position.request()}>{position.status === "loading" ? "Zjišťuji polohu…" : "Zobrazit moji polohu"}</button></div>
    {position.error && <p role="alert">{position.error}</p>}{distance !== null && <p role="status">Vzdušnou čarou k bodu RIS přibližně {(distance/1000).toLocaleString("cs-CZ",{maximumFractionDigits:2})} km · přesnost GPS ±{Math.round(position.evidence.accuracyMeters)} m · zjištěno {new Date(position.evidence.capturedAt).toLocaleTimeString("cs-CZ")}. Nejde o vzdálenost k hranici vody ani trasu.</p>}
  </section>;
}
