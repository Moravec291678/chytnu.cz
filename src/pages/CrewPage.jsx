import { useEffect, useState } from "react";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import {
  CREW_CHALLENGE_TYPES,
  CREW_MAX_MEMBERS,
  CREW_MIN_MEMBERS,
  CREW_PRIVACY_OPTIONS,
} from "../features/crew/data/crewModel.js";
import { crewRepository } from "../features/crew/data/crewRepository.js";
import Layout from "../shared/layout/Layout";
import "./CrewPage.css";

const EMPTY_FORM = Object.freeze({
  name: "",
  privacy: "private",
  challenge: { enabled: false, type: "catch-count", target: 10 },
});

function formFromCrew(crew) {
  if (!crew) return { ...EMPTY_FORM, challenge: { ...EMPTY_FORM.challenge } };
  return {
    name: crew.name,
    privacy: crew.privacy,
    challenge: { ...crew.challenge },
  };
}

function CrewPage() {
  const auth = useAuth();
  const scope = useDataScope();
  const [crew, setCrew] = useState(null);
  const [form, setForm] = useState(() => formFromCrew(null));
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (scope.status !== "ready") return () => { active = false; };
    crewRepository.get(scope).then((record) => {
      if (!active) return;
      setCrew(record);
      setForm(formFromCrew(record));
      setStatus("ready");
    }).catch(() => {
      if (!active) return;
      setStatus("error");
      setMessage("Skupinu se nepodařilo načíst. Zkus to znovu.");
    });
    return () => { active = false; };
  }, [scope]);

  const setChallenge = (key, value) => {
    setForm((current) => ({ ...current, challenge: { ...current.challenge, [key]: value } }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (scope.status !== "ready") return;
    setStatus("saving");
    setMessage("");
    try {
      const saved = crew
        ? await crewRepository.update(crew.id, form, scope)
        : await crewRepository.create(form, scope);
      setCrew(saved);
      setForm(formFromCrew(saved));
      setStatus("ready");
      setMessage(crew ? "Místní Crew byla upravena." : "Místní Crew byla vytvořena jako soukromý draft.");
    } catch {
      setStatus("error");
      setMessage("Skupinu se nepodařilo uložit. Zkus to znovu.");
    }
  };

  const leaveAndDelete = async () => {
    if (!crew || scope.status !== "ready") return;
    if (!window.confirm("Opustit a smazat tuto místní Crew? Tato akce odstraní pouze lokální draft.")) return;
    setStatus("saving");
    setMessage("");
    try {
      await crewRepository.leave(crew.id, scope);
      setCrew(null);
      setForm(formFromCrew(null));
      setStatus("ready");
      setMessage("Místní Crew byla opuštěna a smazána.");
    } catch {
      setStatus("error");
      setMessage("Skupinu se nepodařilo smazat. Zkus to znovu.");
    }
  };

  const profileName = auth.user?.displayName?.trim() || (auth.user ? "Můj profil" : "Místní profil");
  const memberCount = crew?.memberKeys?.length ?? 0;
  const selectedChallenge = CREW_CHALLENGE_TYPES.find((item) => item.id === form.challenge.type) ?? CREW_CHALLENGE_TYPES[0];
  const busy = status === "loading" || status === "saving" || scope.status !== "ready";

  return (
    <Layout>
      <section className="crew-page" aria-labelledby="crew-title">
        <header className="crew-header">
          <div>
            <h1 id="crew-title">Crew</h1>
            <p>Soukromá skupina uložená v tomto zařízení</p>
          </div>
          <span className="crew-backend-badge">Jen místně</span>
        </header>

        {crew && (
          <section className="crew-summary" aria-labelledby="crew-summary-title">
            <div className="crew-summary-heading">
              <div><span>MÍSTNÍ NÁVRH</span><h2 id="crew-summary-title">{crew.name}</h2></div>
              <b>{crew.privacy === "invite-only" ? "Na pozvání" : "Soukromá"}</b>
            </div>
            <div className="crew-stat-grid">
              <article><span>Členové</span><strong>{memberCount} / {CREW_MAX_MEMBERS}</strong><small>{memberCount < CREW_MIN_MEMBERS ? `Crew potřebuje alespoň ${CREW_MIN_MEMBERS} členy.` : "Crew má minimální počet členů."}</small></article>
              <article><span>Víkend</span><strong>Bez dat</strong><small>Společné statistiky vyžadují synchronizaci.</small></article>
              <article><span>Druhy</span><strong>Bez dat</strong><small>Počty členů se lokálně neslučují.</small></article>
            </div>
            <div className="crew-current-member"><span aria-hidden="true">●</span><div><strong>{profileName}</strong><small>Aktuální profil · vlastník lokálního draftu</small></div></div>
          </section>
        )}

        <form className="crew-form" onSubmit={save} aria-labelledby="crew-form-title">
          <div className="crew-form-heading">
            <div><span>{crew ? "Nastavení" : "Nová Crew"}</span><h2 id="crew-form-title">{crew ? "Upravit místní Crew" : "Vytvořit místní Crew"}</h2></div>
            <em>Jen toto zařízení</em>
          </div>
          <label>Název Crew
            <input value={form.name} maxLength={60} disabled={busy} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Název skupiny" required />
          </label>
          <label>Soukromí
            <select value={form.privacy} disabled={busy} onChange={(event) => setForm((current) => ({ ...current, privacy: event.target.value }))}>
              {CREW_PRIVACY_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
            </select>
          </label>
          <p>Skupina je soukromá a dostupná jen v tomto zařízení. Pozvánky zatím nejsou dostupné.</p>

          <fieldset className="crew-challenge-config" disabled={busy}>
            <legend>Crew výzva</legend>
            <label className="crew-check"><input type="checkbox" checked={form.challenge.enabled} onChange={(event) => setChallenge("enabled", event.target.checked)} /><span>Aktivovat konfiguraci výzvy</span></label>
            <label>Typ cíle
              <select value={form.challenge.type} disabled={!form.challenge.enabled || busy} onChange={(event) => setChallenge("type", event.target.value)}>
                {CREW_CHALLENGE_TYPES.map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}
              </select>
            </label>
            <label>Cíl ({selectedChallenge.unit})
              <input type="number" min="0.1" max="100000" step={form.challenge.type === "total-weight" ? "0.1" : "1"} value={form.challenge.target} disabled={!form.challenge.enabled || busy} onChange={(event) => setChallenge("target", event.target.value)} />
            </label>
            <small>Nastavení se ukládá v tomto zařízení. Společný postup se zobrazí, až bude možné synchronizovat členy.</small>
          </fieldset>

          <button className="crew-save" type="submit" disabled={busy}>{status === "saving" ? "Ukládám…" : crew ? "Uložit změny" : "Vytvořit lokální Crew"}</button>
          {message && <p className={status === "error" ? "crew-error" : "crew-feedback"} role="status">{message}</p>}
        </form>

        <section className="crew-remote" aria-labelledby="crew-remote-title">
          <div><span>ZATÍM NEDOSTUPNÉ</span><h2 id="crew-remote-title">Týmové funkce</h2></div>
          <div className="crew-remote-grid">
            <article><strong>Pozvat / přidat člena</strong><p>Pozvánky, join a synchronizace členů nejsou aktivní.</p><button type="button" disabled>Pozvat člena</button></article>
            <article><strong>Žebříček</strong><p>Bez vzdálených členů se nevytváří pořadí, váhy ani skóre.</p></article>
            <article><strong>Živá mapa</strong><p>Přesná poloha se ve výchozím stavu nikdy nesdílí.</p></article>
          </div>
        </section>

        {crew && <button className="crew-delete" type="button" disabled={busy} onClick={leaveAndDelete}>Opustit a smazat místní Crew</button>}
        <p className="crew-entitlement-note">Lokální draft neověřuje Supporter stav, neúčtuje platbu a neodemkne vzdálené funkce.</p>
      </section>
    </Layout>
  );
}

export default CrewPage;
