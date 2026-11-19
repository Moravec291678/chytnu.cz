import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { buildPersonalFishingAnalysis, selectPersonalInsight, personalRecordCountLabel } from "../../ai/personalFishingAnalysis.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { loadHomeInsightState, saveHomeInsightState } from "../utils/homeInsightCache.js";
import "./HomeInsightCard.css";

const today = time => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));

export default function HomeInsightCard({ catches, trips }) {
  const scope = useDataScope();
  const [waters, setWaters] = useState([]);
  const [stored, setStored] = useState(null);
  const [cacheError, setCacheError] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const state = useRef(null), sequence = useRef(0);
  const report = useMemo(() => buildPersonalFishingAnalysis(catches, { trips, waters, now: clock }), [catches, trips, waters, clock]);
  const cache = stored?.scopeKey === scope.scopeKey && stored.ownerId === scope.ownerId ? stored : null;
  const currentId = cache?.selection?.fingerprint === report.fingerprint && cache.selection.day === today(clock) ? cache.selection.id : null;
  const selected = selectPersonalInsight(report.candidates, cache?.seenIds, currentId);
  const persist = useCallback(async (patch, ticket = sequence.current) => {
    const previous = state.current;
    if (!previous || ticket !== sequence.current) return false;
    const next = { ...previous, ...patch };
    try {
      const saved = await saveHomeInsightState(scope, next, previous);
      if (!saved) throw new Error("Postřeh se mezitím změnil nebo jej nelze uložit.");
      if (ticket !== sequence.current) return false;
      state.current = next;
      setStored(next);
      setCacheError("");
      return true;
    } catch (error) {
      if (ticket === sequence.current) setCacheError(error.message || "Postřeh se nepodařilo uložit.");
      return false;
    }
  }, [scope]);
  useEffect(() => {
    let active = true;
    sequence.current++;
    const refresh = async () => {
      const ticket = ++sequence.current;
      try {
        const [value, waterList] = await Promise.all([loadHomeInsightState(scope), waterRepository.list(scope)]);
        if (!active || ticket !== sequence.current) return;
        state.current = value;
        setStored(value);
        setWaters(waterList);
        setClock(Date.now());
        setCacheError("");
      } catch (error) {
        if (active && ticket === sequence.current) setCacheError(error.message || "Místní postřeh se nepodařilo načíst.");
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("chytnu:local-data-restored", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("chytnu:local-data-restored", refresh);
    };
  }, [scope]);
  useEffect(() => {
    if (!cache || !selected || (cache.selection?.id === selected.id && cache.selection.fingerprint === report.fingerprint && cache.selection.day === today(clock))) return;
    void Promise.resolve().then(() => persist({ selection: { id: selected.id, fingerprint: report.fingerprint, day: today(clock) },
      seenIds: [...(state.current?.seenIds ?? []).filter(id => id !== selected.id), selected.id].slice(-40) }));
  }, [cache, selected, report.fingerprint, persist, clock]);
  if (!selected) return null;
  const nextInsight = () => {
    const index = report.candidates.findIndex(item => item.id === selected.id);
    const next = report.candidates[(index + 1) % report.candidates.length];
    void persist({ selection: { id: next.id, fingerprint: report.fingerprint, day: today(clock) },
      seenIds: [...(cache?.seenIds ?? []).filter(id => id !== next.id), next.id].slice(-40) });
  };
  return <section className="home-insight-card home-personal-insight" aria-labelledby="home-insight-title">
    <div className="home-personal-insight-heading"><span className="home-progress-kicker">◈ {selected.source}</span><span className="home-personal-insight-count">{personalRecordCountLabel(report.recordCount)} · výpočet v zařízení</span></div>
    <h2 id="home-insight-title">{selected.title}</h2>
    <p className="home-personal-observation">{selected.observation}</p>
    <div className="home-personal-experiment"><strong>Ověř při další vycházce</strong><p>{selected.experiment}</p></div>
    <p className="home-personal-uncertainty">{selected.uncertainty}</p>
    <details className="home-personal-detail"><summary>Zobrazit podrobnou analýzu</summary>
      <h3>Co může souvislost znamenat</h3><p>{selected.interpretation}</p>
      <h3>Podklad pro ověření</h3><p>Čísla nahoře vypočítala aplikace z konkrétních záznamů. Nejde o výstup modelu ani důkaz příčiny.</p>
      {selected.evidenceIds.length > 0 && <ul className="home-personal-evidence">{selected.evidenceIds.slice(0, 20).map((id, index) => <li key={id}><Link to={`/catch/${encodeURIComponent(id)}`}>Záznam {index + 1}</Link></li>)}</ul>}
      {selected.evidenceIds.length > 20 && <p>Odkazy na prvních 20 podkladů. <Link to="/journal">Otevřít celý deník</Link></p>}
      {report.truncated && <p>Vyhodnoceno nejvýše 500 posledních platných úlovků.</p>}
      {report.candidates.length > 1 && <button type="button" className="home-personal-secondary" onClick={nextInsight}>Další podložený postřeh ({report.candidates.length})</button>}
      <Link className="home-personal-analysis-link" to="/insights">Otevřít přehledy deníku →</Link>
    </details>
    {cacheError && <p role="status">{cacheError} Místní rozbor zůstává dostupný.</p>}
  </section>;
}
