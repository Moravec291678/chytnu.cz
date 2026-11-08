import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { AI_FEATURES, hasAiConsent } from "../../ai/aiPolicy.js";
import { AI_CONSENT_CHANGED_EVENT, createAiClient } from "../../ai/aiClient.js";
import { buildPersonalFishingAnalysis, selectPersonalInsight, personalRecordCountLabel } from "../../ai/personalFishingAnalysis.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { clearHomeInsightState, loadHomeInsightState, saveHomeInsightState, usableHomeAiResult } from "../utils/homeInsightCache.js";
import "./HomeInsightCard.css";

const today = time => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
const HARD_LIMITS = new Set(["user_daily_limit", "app_daily_limit", "text_daily_limit", "provider_quota"]);

export default function HomeInsightCard({ catches, trips, contextReady = true }) {
  const scope = useDataScope();
  const client = useMemo(() => createAiClient({ ownerId: scope.ownerId }), [scope.ownerId]);
  const [waters, setWaters] = useState([]);
  const [stored, setStored] = useState(null);
  const [activity, setActivity] = useState({ busy: false, error: "" });
  const [clock, setClock] = useState(() => Date.now());
  const state = useRef(null), sequence = useRef(0), pending = useRef(null), inFlight = useRef(false);
  const cancelRequests = useCallback(() => { sequence.current++; pending.current?.abort(); }, []);
  const report = useMemo(() => buildPersonalFishingAnalysis(catches, { trips, waters, now: clock }), [catches, trips, waters, clock]);
  const fingerprint = useRef(report.fingerprint);
  useEffect(() => { fingerprint.current = report.fingerprint; }, [report.fingerprint]);
  const cache = stored?.scopeKey === scope.scopeKey ? stored : null;
  const currentId = cache?.selection?.fingerprint === report.fingerprint && cache.selection.day === today(clock) ? cache.selection.id : null;
  const selected = selectPersonalInsight(report.candidates, cache?.seenIds, currentId);
  const persist = useCallback(async (patch, ticket = sequence.current) => {
    const previous = state.current;
    if (!previous || ticket !== sequence.current) return false;
    const next = { ...previous, ...patch };
    const saved = await saveHomeInsightState(scope, next, previous).catch(() => false);
    if (!saved || ticket !== sequence.current) return false;
    state.current = next; setStored(next); return true;
  }, [scope]);
  useEffect(() => {
    let active = true;
    const ticket = ++sequence.current;
    const controller = new AbortController();
    const refreshConsent = async (clear = false) => {
      const loadTicket = clear ? ++sequence.current : sequence.current;
      if (clear) {
        pending.current?.abort();
        await clearHomeInsightState(scope).catch(() => {});
        if (!active || loadTicket !== sequence.current) return;
        const cleared = await loadHomeInsightState(scope).catch(() => null);
        if (!active || loadTicket !== sequence.current) return;
        state.current = cleared; setStored(cleared); setActivity({ busy: false, error: "" });
      }
      if (!scope.ownerId || globalThis.navigator?.onLine === false) return;
      try {
        const consent = await client.getConsent({ signal: controller.signal });
        if (!active || loadTicket !== sequence.current) return;
        const previous = state.current;
        if (!previous) return;
        await persist({ consent, result: previous.consent?.revision === consent?.revision ? previous.result : null }, loadTicket);
      } catch { /* Offline cached consent permits display only, never a new inference. */ }
    };
    void loadHomeInsightState(scope).then(async value => {
      if (!active || ticket !== sequence.current) return;
      state.current = value; setStored(value);
      await refreshConsent();
    }).catch(() => {});
    void waterRepository.list(scope).then(value => { if (active) setWaters(value); }).catch(() => {});
    const consentChanged = () => { void refreshConsent(true); };
    const refreshed = () => { setClock(Date.now()); void refreshConsent();
      void waterRepository.list(scope).then(value => { if (active) setWaters(value); }).catch(() => {}); };
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, consentChanged);
    window.addEventListener("online", refreshed); window.addEventListener("focus", refreshed);
    window.addEventListener("chytnu:local-data-restored", refreshed);
    return () => { active = false; cancelRequests(); controller.abort();
      window.removeEventListener(AI_CONSENT_CHANGED_EVENT, consentChanged); window.removeEventListener("online", refreshed); window.removeEventListener("focus", refreshed);
      window.removeEventListener("chytnu:local-data-restored", refreshed); };
  }, [scope, client, persist, cancelRequests]);
  useEffect(() => {
    if (!cache || !selected || (cache.selection?.id === selected.id && cache.selection.fingerprint === report.fingerprint && cache.selection.day === today(clock))) return;
    void Promise.resolve().then(() => persist({ selection: { id: selected.id, fingerprint: report.fingerprint, day: today(clock) },
      seenIds: [...(state.current?.seenIds ?? []).filter(id => id !== selected.id), selected.id].slice(-40) }));
  }, [cache, selected, report.fingerprint, persist, clock]);
  if (!selected) return null;
  const consent = cache?.consent;
  const allowed = hasAiConsent(consent, "recommendations", "cloudflare");
  const aiAvailable = usableHomeAiResult(cache, { ownerId: scope.ownerId, fingerprint: report.fingerprint, evidenceIds: report.evidenceIds, now: clock });
  const blocked = cache?.blocked?.fingerprint === report.fingerprint
    && (!cache.blocked.retryAt || Date.parse(cache.blocked.retryAt) > clock);
  const generate = async () => {
    if (inFlight.current || !allowed || globalThis.navigator?.onLine === false || blocked || !report.providerSummary.candidates.length) return;
    inFlight.current = true;
    const ticket = sequence.current, sourceFingerprint = report.fingerprint;
    const controller = new AbortController(); pending.current = controller;
    setActivity({ busy: true, error: "" });
    try {
      const result = await client.runHome({ fingerprint: sourceFingerprint }, { consent, signal: controller.signal });
      if (ticket !== sequence.current || fingerprint.current !== sourceFingerprint) return;
      if (result.fingerprint !== sourceFingerprint || result.consentRevision !== consent.revision) throw new Error("Deník nebo souhlas se mezitím změnil. Zobrazený místní rozbor zůstává aktuální.");
      await persist({ result: { ...result, ownerId: scope.ownerId }, blocked: null }, ticket);
      if (ticket === sequence.current) setActivity({ busy: false, error: "" });
    } catch (error) {
      if (ticket !== sequence.current) return;
      if (HARD_LIMITS.has(error.code)) await persist({ blocked: { fingerprint: sourceFingerprint, code: error.code, retryAt: error.retryAt ?? null } }, ticket);
      setActivity({ busy: false, error: error.message || "AI není dostupná. Místní rozbor zůstává k dispozici." });
    } finally { inFlight.current = false; }
  };
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
    {AI_FEATURES.recommendations && scope.ownerId && report.providerSummary.candidates.length > 0 && <div className="home-personal-ai">
      {aiAvailable ? <><span className="home-progress-kicker">Výklad od AI · k ověření</span><p><strong>{report.strongest.title}</strong></p><p>{cache.result.text}</p><small>Výklad patří k nejsilnějšímu postřehu výše, i když si právě prohlížíš jiný podklad. Uloženo {new Date(cache.result.generatedAt).toLocaleDateString("cs-CZ")}.</small></>
        : <><p>Volitelná AI může vyložit vypočítané souvislosti. Otevření Home žádný požadavek modelu nespouští.</p>
          {allowed ? <button type="button" className="home-personal-secondary" disabled={activity.busy || blocked || !contextReady || globalThis.navigator?.onLine === false} onClick={() => void generate()}>{activity.busy ? "AI připravuje výklad…" : "Vygenerovat AI tip"}</button>
            : <Link to="/settings">Povolit AI doporučení v nastavení</Link>}
          {blocked && <p role="status">Další generování je dočasně zastavené kvůli bezplatnému limitu. Místní postřeh zůstává dostupný.</p>}
        </>}
      {activity.error && <p role="alert">{activity.error}</p>}
    </div>}
  </section>;
}
