import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../auth/context/dataScopeContextValue.js";
import { useCatches } from "../catches/context/useCatches.js";
import { AI_FEATURES, hasAiConsent } from "./aiPolicy.js";
import { AI_CONSENT_CHANGED_EVENT, AI_PROVIDER, AiClientError, canApproveAiStory, canDisplayAiResult, createAiClient } from "./aiClient.js";

const TASKS = [["improve", "Vylepšit vyprávění"], ["summarize", "Shrnout poznámku"], ["clarity", "Zhodnotit historku"], ["title", "Navrhnout titulek"]];

export default function CatchAiAssistance({ record }) {
  const scope = useDataScope();
  const { approveAiStoryDraft } = useCatches();
  const client = useMemo(() => createAiClient({ ownerId: scope.ownerId }), [scope.ownerId]);
  const [consentState, setConsentState] = useState({ ownerId: null, consent: null });
  const [storedState, setState] = useState({ ownerId: scope.ownerId, busy: "", draft: null, text: "", reviewed: false });
  const state = storedState.ownerId === scope.ownerId ? storedState : { ownerId: scope.ownerId, busy: "", draft: null, text: "", reviewed: false };
  const latest = useRef(record);
  const sequence = useRef(0);
  const requestController = useRef(null);
  const requestBusy = useRef(false);
  const consentSequence = useRef(0);
  const cancelRequests = useCallback(() => { sequence.current++; requestController.current?.abort(); }, []);
  useEffect(() => { latest.current = record; }, [record]);
  useEffect(() => {
    if (!AI_FEATURES.stories || !scope.ownerId) return undefined;
    const controller = new AbortController();
    const load = (event) => {
      const currentConsentSequence = ++consentSequence.current;
      if (event) {
        cancelRequests(); setConsentState({ ownerId: scope.ownerId, consent: null });
        setState({ ownerId: scope.ownerId, busy: "", draft: null, text: "", reviewed: false });
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
  if (!AI_FEATURES.stories) return null;
  if (!scope.ownerId) return <section className="catch-detail-section"><h2>Volitelná pomoc AI</h2><p>Pro AI funkce se <Link to="/login">přihlas</Link>. Úlovek je uložený i bez nich.</p></section>;
  const consent = consentState.ownerId === scope.ownerId ? consentState.consent : null;
  const storiesAllowed = hasAiConsent(consent, "stories", AI_PROVIDER);
  const run = async (task) => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    const currentSequence = ++sequence.current;
    const snapshot = { id: record.id, revision: record.sync?.revision, notes: record.notes ?? "" };
    const controller = new AbortController(); requestController.current = controller;
    setState((previous) => ({ ...previous, ownerId: scope.ownerId, busy: "stories", error: "", message: "", reviewed: false }));
    try {
      const result = await client.run("stories", { catchId: snapshot.id, task }, { consent, signal: controller.signal });
      if (currentSequence !== sequence.current) return;
      const current = latest.current;
      if (!current || current.id !== snapshot.id || current.sync?.revision !== snapshot.revision) throw new AiClientError("stale_catch");
      if (result.catchId !== snapshot.id || result.originalNotes !== snapshot.notes) throw new AiClientError("stale_draft");
      setState((previous) => ({ ...previous, ownerId: scope.ownerId, busy: "", draft: { ...result, ownerId: scope.ownerId,
        consentRevision: consent.revision, expectedRevision: snapshot.revision }, text: result.text, reviewed: false }));
    } catch (error) {
      if (currentSequence === sequence.current) setState((previous) => ({ ...previous, busy: "", error: error.message }));
    } finally { requestBusy.current = false; }
  };
  const saveDraft = async () => {
    if (requestBusy.current || !state.reviewed || !canDisplayAiResult(state.draft, { ownerId: scope.ownerId, consent, capability: "stories" })
      || !canApproveAiStory(record, state.draft) || record.sync?.revision !== state.draft.expectedRevision) return;
    requestBusy.current = true;
    const currentSequence = ++sequence.current;
    setState((previous) => ({ ...previous, busy: "save", error: "" }));
    try {
      await approveAiStoryDraft(record.id, { originalNotes: state.draft.originalNotes, text: state.text,
        action: state.draft.action, expectedRevision: state.draft.expectedRevision });
      if (currentSequence === sequence.current) setState({ ownerId: scope.ownerId, busy: "", draft: null, text: "", reviewed: false, message: "Schválený text byl uložen do poznámky." });
    } catch (error) {
      if (currentSequence === sequence.current) setState((previous) => ({ ...previous, busy: "", error: error.message || "Návrh se nepodařilo uložit. Tvoje původní poznámka zůstává zachovaná." }));
    } finally { requestBusy.current = false; }
  };
  const draftAuthorized = canDisplayAiResult(state.draft, { ownerId: scope.ownerId, consent, capability: "stories" });
  const draftCurrent = draftAuthorized && state.draft.originalNotes === (record.notes ?? "") && state.draft.expectedRevision === record.sync?.revision;
  return <section className="catch-detail-section">
    <details>
      <summary style={{ minHeight: "44px", padding: "var(--space-3)", cursor: "pointer" }}>Pomoc s rybářským vyprávěním</summary>
      <div style={{ padding: "var(--space-3)", display: "grid", gap: "var(--space-2)" }}>
      <p>Cloudflare zpracuje pouze poznámku k tomuto úlovku, kterou si vyžádáš. AI může chybovat a nic sama nemění ani nezveřejňuje. <Link to="/settings">Souhlasy a soukromí AI</Link></p>
      <div>
        <h3>Pomoc s rybářským vyprávěním</h3>
        {!storiesAllowed && <p>Pro práci s poznámkou nejdřív povol tuto funkci v nastavení. Odešle se text této poznámky.</p>}
        {!record.notes?.trim() && <p>Nejdřív <Link to={`/catch/${encodeURIComponent(record.id)}/edit`}>napiš poznámku k úlovku</Link>. AI může upravit nebo shrnout tvůj vlastní text.</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>{TASKS.map(([task, label]) => <button className="photo-action-button" type="button" key={task}
          disabled={Boolean(state.busy) || !storiesAllowed || !record.notes?.trim()} onClick={() => void run(task)}>{label}</button>)}</div>
        {draftAuthorized && <div>
          <h4>Návrh AI k vlastní kontrole</h4>
          <p>Zkontroluj druh, míry, datum i skutečný průběh. Návrh může obsahovat chyby. Původní poznámka se zatím nemění.</p>
          <label>Navržený text<textarea style={{ width: "100%", minHeight: "10rem", padding: "var(--space-3)",
            border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", color: "var(--text-primary)", font: "inherit" }} maxLength={16_000} value={state.text}
            onChange={(event) => setState((previous) => ({ ...previous, text: event.target.value, reviewed: false }))} /></label>
          {!draftCurrent && <p role="alert">Úlovek se mezitím změnil. Pro uložení vytvoř nový návrh nad aktuální poznámkou.</p>}
          {["summarize", "improve"].includes(state.draft.action) ? <>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minHeight: "44px" }}><input type="checkbox" checked={state.reviewed} disabled={!draftCurrent} onChange={(event) => setState((previous) => ({ ...previous, reviewed: event.target.checked }))} /> Zkontroloval/a jsem fakta a chci tímto textem nahradit poznámku.</label>
            <button className="photo-action-button" type="button" disabled={Boolean(state.busy) || !draftCurrent || !state.reviewed || !state.text.trim() || typeof approveAiStoryDraft !== "function"} onClick={() => void saveDraft()}>Uložit schválený text do poznámky</button>
          </> : <p>Posouzení a návrh titulku jsou jen inspirace. Původní text se nenahrazuje.</p>}
          <button className="photo-action-button" type="button" disabled={Boolean(state.busy)} onClick={() => setState((previous) => ({ ...previous, draft: null, text: "", reviewed: false }))}>Zahodit návrh</button>
        </div>}
      </div>
      {state.busy && <p role="status">{state.busy === "save" ? "Ukládám schválený text…" : "AI připravuje návrh…"}</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {consentState.ownerId === scope.ownerId && consentState.error && <p role="alert">{consentState.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      </div>
    </details>
  </section>;
}
