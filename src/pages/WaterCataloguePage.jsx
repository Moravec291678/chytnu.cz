import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout.jsx";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { catchRepository } from "../features/catches/data/catchRepository.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { risCatalogue, RIS_MANIFEST } from "../features/waters/data/risCatalogue.js";
import { filterCatalogue } from "../features/waters/data/risCatalogueModel.js";
import "./WaterCataloguePage.css";

const date = value => new Date(value).toLocaleDateString("cs-CZ");
const amount = value => value == null ? "Neuvedeno ve zdroji" : value.toLocaleString("cs-CZ");
function useCatalogueResource(loader, key) {
  const [stored,setStored] = useState(null), [version,setVersion] = useState(0);
  useEffect(() => { let active = true; loader().then(data => { if(active)setStored({key,version,data}); }).catch(error => { if(active)setStored({key,version,error:error.message}); }); return () => { active = false; }; },[loader,key,version]);
  const current = stored?.key === key && stored.version === version ? stored : null;
  return { data:current?.data, loading:!current, error:current?.error, retry:()=>setVersion(v=>v+1) };
}
function SourceNotice() {
  return <p className="catalogue-source">ČRS / RIS · export {date(RIS_MANIFEST.fetchedAt)}. Pravidla jsou snímek zdroje k datu exportu a mohou se změnit. Před lovem ověř aktuální znění u ČRS. Souřadnice označují zdrojový bod, nikoli hranice revíru. Katalog a otevřené detaily se ukládají pro další použití offline.</p>;
}
export default function WaterCataloguePage() {
  const resource = useCatalogueResource(risCatalogue.list,"index");
  const [query,setQuery] = useState(""),[fisheryType,setFisheryType] = useState(""),[union,setUnion] = useState(""),[withCoordinates,setWithCoordinates] = useState(false),[page,setPage] = useState(0);
  const unions = useMemo(()=>[...new Set((resource.data ?? []).map(row=>row.union).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"cs")),[resource.data]);
  const filtered = useMemo(()=>filterCatalogue(resource.data ?? [],{query,fisheryType,union,withCoordinates}),[resource.data,query,fisheryType,union,withCoordinates]);
  const update = setter => event => { setter(event.target.type === "checkbox" ? event.target.checked : event.target.value); setPage(0); };
  return <Layout><div className="catalogue-page"><header><Link to="/waters">← Moje revíry</Link><h1>Katalog revírů RIS</h1><p>{RIS_MANIFEST.count.toLocaleString("cs-CZ")} revírů · veřejný katalog oddělený od tvého deníku</p></header><SourceNotice />
    <div className="catalogue-filters"><label>Hledat revír<input type="search" value={query} onChange={update(setQuery)} placeholder="Název, číslo nebo oblast…" /></label>
      <label>Druh revíru<select value={fisheryType} onChange={update(setFisheryType)}><option value="">Všechny druhy</option><option>Mimopstruhový</option><option>Pstruhový</option></select></label>
      <label>Územní svaz<select value={union} onChange={update(setUnion)}><option value="">Všechny svazy</option>{unions.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="catalogue-check"><input type="checkbox" checked={withCoordinates} onChange={update(setWithCoordinates)} />Pouze se souřadnicemi</label></div>
    {resource.loading ? <p role="status">Načítám katalog…</p> : resource.error ? <p role="alert">{resource.error} <button onClick={resource.retry}>Zkusit znovu</button></p> : <><p role="status">Nalezeno {filtered.length.toLocaleString("cs-CZ")} revírů</p>
      <div className="catalogue-list">{filtered.slice(page*40,(page+1)*40).map(row=><Link key={row.id} to={`/waters/catalogue/${row.id}`} className="catalogue-card"><strong>{row.name}</strong><span>č. {row.number} · {row.fisheryType || "Druh neuveden"}</span><small>{row.union || "Svaz neuveden"}</small></Link>)}</div>
      {!filtered.length && <p>Zkus upravit hledání nebo filtry. Hledání funguje i bez diakritiky.</p>}
      {filtered.length > 40 && <nav className="catalogue-pagination" aria-label="Stránky katalogu"><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Předchozí</button><span>{page+1} / {Math.ceil(filtered.length/40)}</span><button disabled={(page+1)*40>=filtered.length} onClick={()=>setPage(p=>p+1)}>Další</button></nav>}</>}
  </div></Layout>;
}

export function CatalogueWaterDetail() {
  const { catalogueId } = useParams(), scope = useDataScope(), navigate = useNavigate();
  const loader = useCallback(()=>risCatalogue.get(catalogueId),[catalogueId]);
  const resource = useCatalogueResource(loader,catalogueId);
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const scopeRef = useRef(scope.scopeKey);
  useEffect(()=>{scopeRef.current=scope.scopeKey; return ()=>{scopeRef.current=null;};},[scope.scopeKey]);
  const select = async () => {
    if(busy || !resource.data || scope.status !== "ready")return;
    setBusy(true); setError(""); const requested = scope.scopeKey;
    try {
      const generation = await catchRepository.getQuickCaptureGeneration(scope);
      if(scopeRef.current !== requested)return;
      const water = await waterRepository.selectCatalogueWater(resource.data,scope,{generation});
      if(scopeRef.current === requested)navigate(`/waters/${water.id}`);
    } catch(e) { if(scopeRef.current === requested)setError(e.message); }
    finally { if(scopeRef.current === requested)setBusy(false); }
  };
  const row = resource.data, detail = row?.detail;
  return <Layout><div className="catalogue-page"><Link to="/waters/catalogue">← Katalog revírů</Link>
    {resource.loading ? <p role="status">Načítám detail revíru…</p> : resource.error ? <p role="alert">{resource.error} <button onClick={resource.retry}>Zkusit znovu</button></p> : !row ? <h1>Revír v katalogu nenalezen</h1> : <>
      <header><p>{row.number} · {row.fisheryType || "Druh neuveden"}</p><h1>{row.name}</h1><p>{row.union}</p></header><SourceNotice />
      <button className="catalogue-save" onClick={select} disabled={busy || scope.status !== "ready"}>{busy ? "Ukládám…" : "Uložit do mých revírů"}</button><p>Uloží soukromý revír pro úlovky a vycházky. Opakovaná volba otevře existující záznam a zachová vlastní poznámky i úpravy.</p>{error && <p role="alert">{error}</p>}
      {!row.numberUnique && <p>Zdroj uvádí stejné číslo u více odlišných revírů. Tyto záznamy se neslučují.</p>}
      <dl className="catalogue-facts"><div><dt>Rozloha (ha)</dt><dd>{amount(detail.areaHa)}</dd></div><div><dt>Délka toku (km)</dt><dd>{amount(detail.lengthKm)}</dd></div><div><dt>Souřadnice bodu RIS</dt><dd>{detail.coordinates ? `${detail.coordinates.latitude}, ${detail.coordinates.longitude}` : "Neuvedeny ve zdroji"}</dd></div><div><dt>Detail získán</dt><dd>{date(detail.retrievedAt)}</dd></div></dl>
      <section><h2>Popis revíru</h2><p className="catalogue-text">{row.description || "Samostatný popis nebyl ve zdroji rozpoznán. Úplný text je dostupný níže."}</p></section>
      <section><h2>Podmínky a další údaje ze zdroje</h2><p>Údaje níže zachovávají znění exportu včetně jeho označení „Dnes“. Nejde o dnešní ověření pravidel.</p><details><summary>Úplný text detailu RIS</summary><div className="catalogue-text">{detail.pageText}</div></details>
      {detail.tables.map((table,index)=><details key={index}><summary>Tabulka ze zdroje {index+1} · snímek {date(detail.retrievedAt)}</summary><div className="catalogue-table"><table><caption>Údaje zachycené v exportu RIS</caption><thead><tr>{table.headers.map((header,i)=><th key={i} scope="col">{header}</th>)}</tr></thead><tbody>{table.rows.map((cells,i)=><tr key={i}>{cells.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div></details>)}
      <details><summary>Nadpisy zdrojové stránky</summary><ul>{detail.headings.map((heading,i)=><li key={i}>{heading.text}</li>)}</ul></details></section>
      <a href={row.url} target="_blank" rel="noopener noreferrer">Ověřit aktuální pravidla v RIS ↗</a>
    </>}
  </div></Layout>;
}
