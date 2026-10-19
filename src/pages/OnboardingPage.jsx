import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { readPreferences, savePreferences, completeOnboarding } from "../features/preferences/data/preferences.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";

export default function OnboardingPage() {
  const [step, setStep] = useState(1); const [detailMode, setDetailMode] = useState(readPreferences().detailMode);
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const navigate = useNavigate();
  const scope = useDataScope();
  const requestLocation = () => {
    if (!navigator.geolocation) { setMessage("Poloha není v tomto prohlížeči dostupná. Aplikaci můžeš používat i bez ní."); return; }
    navigator.geolocation.getCurrentPosition(() => setMessage("Poloha byla povolena. Přesnou polohu uloží aplikace jen při jejím vědomém přidání k úlovku."), () => setMessage("Poloha nebyla povolena. Aplikaci můžeš používat i bez ní."), { timeout: 8000 });
  };
  const finish = (skip = false) => { try { savePreferences({ detailMode: skip ? readPreferences().detailMode : detailMode }); completeOnboarding(scope.scopeKey); navigate("/", { replace: true }); } catch (saveError) { setError(saveError.message); } };
  if (scope.status !== "ready") return <Layout><p className="loading-state" role="status">Připravuji místní profil…</p></Layout>;
  return <Layout><section className="add-catch-section"><h1>Vítej v Chytnu</h1>
    {step === 1 ? <><p>Vyber, kolik podrobností chceš při zápisu úlovku vidět. Volbu můžeš později změnit v nastavení.</p><label><input type="radio" name="mode" checked={detailMode === "simple"} onChange={() => setDetailMode("simple")} /> Rychlý zápis</label><br /><label><input type="radio" name="mode" checked={detailMode === "detailed"} onChange={() => setDetailMode("detailed")} /> Podrobný zápis</label><p><button type="button" onClick={() => { try { savePreferences({ detailMode }); setStep(2); } catch (saveError) { setError(saveError.message); } }}>Pokračovat</button></p></> : <><p>Můžeš si povolit polohu nebo rovnou zapsat první úlovek. Obě možnosti lze přeskočit.</p><button type="button" onClick={requestLocation}>Povolit polohu</button> <button type="button" onClick={() => { try { savePreferences({ detailMode }); completeOnboarding(scope.scopeKey); navigate("/add"); } catch (saveError) { setError(saveError.message); } }}>Zapsat první úlovek</button><p>{message}</p><button type="button" onClick={() => finish()}>Dokončit</button></>}
    <button type="button" onClick={() => finish(true)}>Přeskočit nastavení</button>{error && <p role="alert">{error}</p>}
  </section></Layout>;
}
