import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../auth/context/dataScopeContextValue.js";
import { AI_FEATURES, hasAiConsent } from "./aiPolicy.js";
import { AI_CONSENT_CHANGED_EVENT, AI_PROVIDER, createAiClient } from "./aiClient.js";

const LABELS = {
  species: "Rozpoznávání druhů ryb z fotografie",
  stories: "Pomoc s rybářským vyprávěním",
  diary: "AI vysvětlení souhrnů deníku",
  recommendations: "AI návrhy pro další vycházku",
};
const enabled = Object.keys(LABELS).filter((key) => AI_FEATURES[key]);
const emptyChoices = () => Object.fromEntries(Object.keys(LABELS).map((key) => [key, false]));

export default function AiSettings() {
  const scope = useDataScope();
  const client = useMemo(() => createAiClient({ ownerId: scope.ownerId }), [scope.ownerId]);
  const [state, setState] = useState({ ownerId: null, status: "loading", choices: emptyChoices(), consent: null });
  const ticket = useRef(0);
  const saving = useRef(false);
  const invalidateRequests = useCallback(() => { ticket.current++; }, []);
  useEffect(() => {
    if (!enabled.length || !scope.ownerId || scope.status !== "ready") return undefined;
    const sequence = ++ticket.current;
    const controller = new AbortController();
    client.getConsent({ signal: controller.signal }).then((consent) => {
      if (sequence !== ticket.current) return;
      setState({ ownerId: scope.ownerId, status: "ready", consent,
        choices: Object.fromEntries(Object.keys(LABELS).map((key) => [key, hasAiConsent(consent, key, AI_PROVIDER)])) });
    }).catch((error) => {
      if (sequence === ticket.current) setState({ ownerId: scope.ownerId, status: "error", choices: emptyChoices(), consent: null, error: error.message });
    });
    return () => { invalidateRequests(); controller.abort(); };
  }, [client, scope.ownerId, scope.status, invalidateRequests]);
  if (!enabled.length) return null;
  if (!scope.ownerId) return <div><h3>Volitelná AI</h3><p>Pro AI funkce se <Link to="/login">přihlas</Link>. Rychlé ukládání a místní přehledy fungují i bez nich.</p></div>;
  const current = state.ownerId === scope.ownerId ? state : { status: "loading", choices: emptyChoices(), consent: null };
  const busy = current.status === "loading" || current.status === "saving";
  const changeConsent = async (revoke = false) => {
    if (saving.current) return;
    saving.current = true;
    const sequence = ++ticket.current;
    setState({ ...current, ownerId: scope.ownerId, status: "saving", error: "", message: "" });
    try {
      const consent = revoke ? await client.revokeConsent() : await client.updateConsent(current.choices, { expectedRevision: current.consent?.revision ?? 0 });
      if (sequence !== ticket.current) return;
      setState({ ownerId: scope.ownerId, status: "ready", consent,
        choices: Object.fromEntries(Object.keys(LABELS).map((key) => [key, hasAiConsent(consent, key, AI_PROVIDER)])),
        message: (revoke || consent?.revokedAt ? "Souhlas s AI byl odvolán. Další obsah se bez nového souhlasu neodešle." : "Volby AI jsou uložené. Každou analýzu spustíš sám.")
          + (consent?.cleanupPending ? " Smazání uložených návrhů ještě není dokončené. Zkus odvolání souhlasu zopakovat." : "") });
      window.dispatchEvent(new Event(AI_CONSENT_CHANGED_EVENT));
    } catch (error) {
      if (error.code === "consent_conflict") {
        try {
          const consent = await client.getConsent();
          if (sequence !== ticket.current) return;
          setState({ ownerId: scope.ownerId, status: "ready", consent, error: error.message,
            choices: Object.fromEntries(Object.keys(LABELS).map((key) => [key, hasAiConsent(consent, key, AI_PROVIDER)])) });
          window.dispatchEvent(new Event(AI_CONSENT_CHANGED_EVENT));
          return;
        } catch { /* Keep the original consent-conflict message. */ }
      }
      if (sequence === ticket.current) setState({ ...current, ownerId: scope.ownerId, status: "error", error: error.message });
    } finally { saving.current = false; }
  };
  return <div className="settings-ai-consent" style={{ display: "grid", gap: "var(--space-2-5)" }}>
    <h3>Volitelná AI přes Cloudflare</h3>
    <p>Ve výchozím stavu je vše vypnuté. Povolení samo nic neanalyzuje; obsah odešleš až příslušným tlačítkem. AI může chybovat.</p>
    <details><summary>Co se odešle a komu</summary>
      <p>Poskytovatel: Cloudflare Workers AI. Při rozpoznávání odešleme vybranou fotografii zbavenou metadat. Přesná poloha ani celý deník se neposílají.</p>
      <p>Pro vysvětlení deníku a doporučení odešleme vypočítané souhrny bez jednotlivých úlovků, fotografií a poznámek. Pro práci s historkou odešleme pouze poznámku vybraného úlovku. Do poznámky proto nevkládej údaje, které externí službě sdělovat nechceš.</p>
      <p>Výsledky jsou návrhy. Druh potvrdíš v editoru a text zkontroluješ před uložením. Souhlas můžeš kdykoli odvolat; tím se nezruší již dokončené zpracování.</p>
      <p><Link to="/privacy-policy">Zásady ochrany soukromí</Link></p>
    </details>
    {enabled.map((key) => <label className="settings-toggle" key={key} style={{ minHeight: "44px" }}>
      <input type="checkbox" checked={current.choices[key]} disabled={busy} onChange={(event) => setState({ ...current, ownerId: scope.ownerId, choices: { ...current.choices, [key]: event.target.checked }, message: "" })} />
      <span>{LABELS[key]}</span>
    </label>)}
    <p>Zaškrtnutím vybraných možností a stiskem „Uložit souhlas s AI“ souhlasíš s popsaným externím zpracováním těchto údajů.</p>
    <button className="settings-primary-button" type="button" disabled={busy} onClick={() => void changeConsent(false)}>{current.status === "saving" ? "Ukládám…" : "Uložit souhlas s AI"}</button>
    <button className="settings-secondary-button" type="button" disabled={busy} onClick={() => void changeConsent(true)}>Odvolat veškerý souhlas s AI</button>
    {current.status === "loading" && <p role="status">Načítám volby AI…</p>}
    {current.error && <p role="alert">{current.error}</p>}
    {current.message && <p role="status">{current.message}</p>}
    <p>Pokud je bezplatná kapacita vyčerpaná, AI se zastaví. Uložení úlovků a místní přehledy dál fungují.</p>
  </div>;
}
