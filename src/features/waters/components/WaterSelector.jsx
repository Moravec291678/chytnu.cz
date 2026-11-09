import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { catchRepository } from "../../catches/data/catchRepository.js";
import { waterRepository } from "../data/waterRepository.js";
import { risCatalogue } from "../data/risCatalogue.js";
import { rankPersonalWaters, searchWaterSuggestions } from "../data/waterSelection.js";
import "./WaterSelector.css";

export default function WaterSelector(props) {
  const scope=useDataScope();
  return <ScopedWaterSelector key={scope.scopeKey} {...props} scope={scope} />;
}
function ScopedWaterSelector({ scope, onSelect, recentIds = [], disabled = false }) {
  const id = useId(), input = useRef(null), trigger = useRef(null), busyRef = useRef(false), activeScope = useRef(null), wasOpen = useRef(false), optionRefs = useRef([]);
  const [open,setOpen] = useState(false),[query,setQuery] = useState(""),[active,setActive] = useState(-1),[busy,setBusy] = useState(false),[version,setVersion] = useState(0);
  const [stored,setStored] = useState(null),[error,setError] = useState("");
  useEffect(()=>{ activeScope.current=scope.scopeKey; return ()=>{activeScope.current=null;}; },[scope.scopeKey]);
  useEffect(()=>{if(open)input.current?.focus();else if(wasOpen.current && !busy)trigger.current?.focus();wasOpen.current=open;},[open,busy]);
  useEffect(()=>{optionRefs.current[active]?.scrollIntoView({block:"nearest"});},[active]);
  useEffect(()=>{
    if(!open || scope.status !== "ready")return undefined;
    let live=true;
    const merge=patch=>{if(live)setStored(previous=>({...((previous?.scopeKey === scope.scopeKey && previous.version === version) ? previous : {scopeKey:scope.scopeKey,version,waters:[],rows:[],catalogueLoading:true}),...patch}));};
    waterRepository.list(scope).then(waters=>merge({waters})).catch(()=>merge({error:"Osobní revíry se nepodařilo načíst."}));
    risCatalogue.list().then(rows=>merge({rows,catalogueLoading:false})).catch(error=>merge({error:error.message,catalogueLoading:false}));
    return ()=>{live=false;};
  },[open,scope,version]);
  const current=stored?.scopeKey === scope.scopeKey && stored.version === version ? stored : null;
  const options=useMemo(()=>{
    const personal=searchWaterSuggestions(rankPersonalWaters(current?.waters ?? [],recentIds),query).slice(0,12);
    const saved=new Set(personal.map(water=>water.catalogueId).filter(Boolean));
    const catalogue=searchWaterSuggestions(current?.rows ?? [],query).filter(row=>!saved.has(row.id)).sort((a,b)=>a.name.localeCompare(b.name,"cs")).slice(0,20);
    const byId=new Map((current?.rows ?? []).map(row=>[row.id,row]));
    return [...personal.map(water=>({kind:"personal",water,type:byId.get(water.catalogueId)?.fisheryType ?? water.type})),...catalogue.map(water=>({kind:"catalogue",water,type:water.fisheryType}))];
  },[current,query,recentIds]);
  const close=()=>{setOpen(false);trigger.current?.focus();};
  const choose=async option=>{
    if(busyRef.current || disabled || scope.status !== "ready")return;
    busyRef.current=true;setBusy(true);setError("");const requested=scope.scopeKey;
    try {
      const generation=await catchRepository.getQuickCaptureGeneration(scope);
      if(activeScope.current !== requested)return;
      const water=option.kind === "personal" ? await waterRepository.get(option.water.id,scope) : await waterRepository.selectCatalogueWater(option.water,scope,{generation});
      if(activeScope.current !== requested)return;
      if(!water || water.deleted)throw new Error("Revír již není dostupný. Obnov nabídku.");
      onSelect(water);close();
    } catch(e) {if(activeScope.current === requested)setError(e.message || "Revír se nepodařilo vybrat.");}
    finally {busyRef.current=false;if(activeScope.current === requested)setBusy(false);}
  };
  const keyDown=event=>{
    if(event.key === "Escape"){event.preventDefault();close();}
    if(["ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();setActive(previous=>!options.length ? -1 : previous < 0 ? event.key === "ArrowDown" ? 0 : options.length-1 : (previous+(event.key === "ArrowDown" ? 1 : -1)+options.length)%options.length);}
    if(event.key === "Enter"){event.preventDefault();if(options[active >= 0 ? active : 0])void choose(options[active >= 0 ? active : 0]);}
  };
  return <div className="water-selector"><button type="button" ref={trigger} className="water-selector-primary" disabled={disabled || scope.status !== "ready" || busy} aria-expanded={open} aria-controls={`${id}-panel`} onClick={()=>{setOpen(value=>!value);setActive(-1);}}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M5 20c2-2 4 2 6 0"/></svg>Vybrat revír z ČRS</button>
    {open && <section id={`${id}-panel`} className="water-selector-panel" aria-label="Výběr revíru z ČRS a osobních vod">
      <label htmlFor={`${id}-search`}>Název nebo číslo revíru</label><input ref={input} id={`${id}-search`} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={active >= 0 && options[active] ? `${id}-option-${active}` : undefined} autoComplete="off" type="search" placeholder="Např. 471 nebo Morava" value={query} onChange={event=>{setQuery(event.target.value);setActive(-1);}} onKeyDown={keyDown} disabled={busy} />
      <p className="water-selector-hint">Oblíbené a použité vody jsou první. Šipky vybírají, Enter potvrdí, Escape zavře. Ruční lokalita a GPS se nepřepisují.</p>
      {(!current || current.catalogueLoading) && <p role="status">Načítám katalog; uložené osobní vody můžeš vybrat hned.</p>}{(error || current?.error) && <p role="alert">{error || current.error} <button type="button" onClick={()=>{setVersion(v=>v+1);setError("");}}>Zkusit znovu</button></p>}
      <div id={`${id}-list`} role="listbox" aria-label="Nalezené revíry" aria-busy={busy} className="water-selector-results">{options.map((option,index)=><button key={`${option.kind}-${option.water.id}`} ref={element=>{optionRefs.current[index]=element;}} type="button" role="option" aria-selected={index === active} id={`${id}-option-${index}`} disabled={busy} onClick={()=>void choose(option)}>
        <strong>{option.water.name}</strong><span>{option.water.number ?? option.water.waterNumber ?? "Bez čísla"} · {option.type}</span><small>{option.kind === "personal" ? option.water.isFavorite ? "★ Oblíbený osobní revír" : "Můj revír" : `ČRS · ${option.water.union ?? "RIS"}`}</small></button>)}</div>
      {current && !current.catalogueLoading && !options.length && <p role="status">Žádný revír neodpovídá hledání. Zkus část názvu nebo čísla; vlastní vodu můžeš zadat ručně.</p>}
      {!!options.length && <p role="status">{options.length} návrhů. Pro zpřesnění pokračuj v psaní.</p>}{busy && <p role="status">Vybírám revír…</p>}
      <button type="button" disabled={busy} onClick={close}>Zavřít výběr</button><Link to="/waters/catalogue">Prohlédnout celý katalog a pravidla</Link>
    </section>}
  </div>;
}
