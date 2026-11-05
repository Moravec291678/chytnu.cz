import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../auth/context/dataScopeContextValue.js";
import { AI_FEATURES, hasAiConsent } from "./aiPolicy.js";
import { AI_CONSENT_CHANGED_EVENT, AI_PROVIDER, canDisplayAiResult, createAiClient } from "./aiClient.js";

export default function DiaryAiExplanation({ report }) {
  const scope = useDataScope();
  const client = useMemo(() => createAiClient({ ownerId: scope.ownerId }), [scope.ownerId]);
  const [consentState, setConsentState] = useState({ ownerId: null, consent: null });
  const [storedState, setState] = useState({ ownerId: scope.ownerId, busy: "", results: {} });
  const state = storedState.ownerId === scope.ownerId ? storedState : { ownerId: scope.ownerId, busy: "", results: {} };
  const sequence = useRef(0);
  const pending = useRef(null);
  const requestBusy = useRef(false);
  const consentSequence = useRef(0);
  const cancelRequests = useCallback(() => { sequence.current++; pending.current?.abort(); }, []);
  const fingerprint = JSON.stringify({ ids: report?.evidenceIds ?? [], statistics: report?.statistics ?? null });
  const latestFingerprint = useRef(fingerprint);
  useEffect(() => { latestFingerprint.current = fingerprint; }, [fingerprint]);
  useEffect(() => {
    if ((!AI_FEATURES.diary && !AI_FEATURES.recommendations) || !scope.ownerId) return undefined;
    const controller = new AbortController();
    const load = (event) => {
      const currentConsentSequence = ++consentSequence.current;
      if (event) {
        cancelRequests(); setConsentState({ ownerId: scope.ownerId, consent: null });
        setState({ ownerId: scope.ownerId, busy: "", results: {} });
      }
      return client.getConsent({ signal: controller.signal }).then((consent) => {
      if (!controller.signal.aborted && currentConsentSequence === consentSequence.current) setConsentState((previous) => previous.ownerId === scope.ownerId
        && (previous.consent?.revision ?? 0) > (consent?.revision ?? 0) ? previous : { ownerId: scope.ownerId, consent });
    }).catch((error) => { if (!controller.signal.aborted && currentConsentSequence === consentSequence.current) setConsentState({ ownerId: scope.ownerId, consent: null, error: error.message }); });
    };
    void load();
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, load);
    return () => { controller.abort(); window.removeEventListener(AI_CONSENT_CHANGED_EVENT, load); cancelRequests(); };
  }, [client, scope.ownerId, cancelRequests]);
  if (!AI_FEATURES.diary && !AI_FEATURES.recommendations) return null;
  if (!scope.ownerId) return <div><h3>Volitelné vysvětlení AI</h3><p>Pro AI se <Link to="/login">přihlas</Link>. Místní rozbor funguje i bez ní.</p></div>;
  const consent = consentState.ownerId === scope.ownerId ? consentState.consent : null;
  const run = async (capability) => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    const currentSequence = ++sequence.current;
    const sourceFingerprint = fingerprint;
    const controller = new AbortController(); pending.current = controller;
    setState((previous) => ({ ...previous, ownerId: scope.ownerId, busy: capability, error: "" }));
    try {
      const result = await client.run(capability, {}, { consent, signal: controller.signal });
      if (currentSequence !== sequence.current) return;
      if (latestFingerprint.current !== sourceFingerprint) {
        setState((previous) => ({ ...previous, busy: "", error: "Deník se mezitím změnil. Pro aktuální vysvětlení spusť AI znovu." }));
        return;
      }
      setState((previous) => ({ ...previous, ownerId: scope.ownerId, busy: "", results: { ...previous.results, [capability]: { ...result,
        ownerId: scope.ownerId, consentRevision: consent.revision, fingerprint: sourceFingerprint } } }));
    } catch (error) {
      if (currentSequence === sequence.current) setState((previous) => ({ ...previous, busy: "", error: error.message }));
    } finally { requestBusy.current = false; }
  };
  const capabilities = [["diary", "Vysvětlit souhrny pomocí AI"], ["recommendations", "Navrhnout možnosti pro další vycházku"]]
    .filter(([key]) => AI_FEATURES[key]);
  return <div className="insights-ai-explanation">
    <h3>Volitelné vysvětlení a návrhy AI</h3>
    <p>Cloudflare dostane pouze vypočítané souhrny synchronizovaných úlovků, bez fotografií, poznámek a přesné polohy. Místní výpočty výše zůstávají podkladem pro ověření.</p>
    <p>AI popis může chybovat. Jeho návrhy jsou hypotézy k posouzení, nikoli zaručená předpověď nebo náhrada skutečných statistik. <Link to="/settings">Nastavit souhlas s AI</Link></p>
    {capabilities.map(([key, label]) => {
      const allowed = hasAiConsent(consent, key, AI_PROVIDER);
      const result = state.results[key];
      const resultAuthorized = canDisplayAiResult(result, { ownerId: scope.ownerId, consent, capability: key });
      return <div key={key}>
        <button className="insights-analysis-button" type="button" disabled={Boolean(state.busy) || !allowed || !report?.evidenceIds?.length} onClick={() => void run(key)}>{label}</button>
        {!allowed && <p>Pro tuto funkci nejdřív uděl souhlas v nastavení.</p>}
        {resultAuthorized && result.fingerprint === fingerprint && <div>
          <h4>{key === "diary" ? "Komentář AI — k ověření" : "Návrhy AI — hypotézy"}</h4>
          <p style={{ whiteSpace: "pre-wrap" }}>{result.text}</p>
          <p>Serverový výpočet použil {result.summary.count} synchronizovaných záznamů. Místní a synchronizovaný přehled se mohou lišit.</p>
          {result.truncated && <p>Zahrnuto je nejvýše 500 posledních synchronizovaných úlovků.</p>}
          {result.limitations.length > 0 && <ul className="insights-list">{result.limitations.map((line) => <li key={line}>{line}</li>)}</ul>}
          <details><summary>Zdrojové záznamy</summary><ul className="insights-evidence">
            {result.evidenceIds.slice(0, 20).map((id) => <li key={id}><Link to={`/catch/${encodeURIComponent(id)}`}>Otevřít záznam úlovku</Link></li>)}
          </ul>{result.evidenceIds.length > 20 && <p>Zobrazeno prvních 20 zdrojů; ostatní jsou dostupné v deníku.</p>}</details>
        </div>}
        {resultAuthorized && result.fingerprint !== fingerprint && <p>Deník se od tohoto návrhu změnil. Pro nové podklady spusť AI znovu.</p>}
      </div>;
    })}
    {state.busy && <p role="status">AI připravuje vysvětlení…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {consentState.ownerId === scope.ownerId && consentState.error && <p role="alert">{consentState.error}</p>}
  </div>;
}
