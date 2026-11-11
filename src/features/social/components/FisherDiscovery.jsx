import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../../shared/layout/Layout.jsx";
import { useAuth } from "../../auth/context/authContextValue.js";
import CollaboratorBadge from "../../admin/CollaboratorBadge.jsx";
import { socialRequest } from "../data/socialClient.js";
import { SharedImage } from "./PublicFishingProfile.jsx";
import FriendshipActions from "./FriendshipActions.jsx";
import { useSocialConnection } from "./useSocialConnection.js";
import "./socialProfiles.css";

const uniqueUsers = users => [...new Map(users.map(user => [user.uid, user])).values()];

export default function FisherDiscovery() {
  const { user } = useAuth(), uid = user?.uid;
  const online = useSocialConnection();
  const [query, setQuery] = useState("");
  const [field, setField] = useState("all");
  const [mode, setMode] = useState("search");
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(0);
  const [paging, setPaging] = useState(null);
  const [action, setAction] = useState(null);
  const pageController = useRef(null), mutationController = useRef(null), sequence = useRef(0), attempts = useRef(new Map());
  const text = query.trim();
  const key = JSON.stringify([uid ?? null, mode, field, text, online]);
  const searchable = Boolean(uid && online && (mode === "new" || text.length >= 2));
  const current = result?.key === key ? result : null;
  const loading = searchable && !current;
  const busy = action?.key === key && action.busy;

  useEffect(() => {
    const controller = new AbortController();
    const timer = searchable ? setTimeout(() => {
      socialRequest("search", { query: mode === "new" ? "" : text, field, mode }, { signal: controller.signal })
        .then(value => { if (!controller.signal.aborted) setResult({ key, users: uniqueUsers(value.users ?? []), nextCursor: value.nextCursor ?? null }); })
        .catch(error => { if (!controller.signal.aborted) setResult({ key, users: [], error: error.message }); });
    }, mode === "new" ? 0 : 350) : null;
    return () => { clearTimeout(timer); controller.abort(); pageController.current?.abort(); mutationController.current?.abort(); };
  }, [key, searchable, field, mode, text, retry]);

  useEffect(() => {
    const refresh = () => { if (searchable && !busy && document.visibilityState === "visible" && navigator.onLine !== false) setRetry(value => value + 1); };
    const timer = setInterval(refresh, 45_000); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [searchable, busy]);

  async function loadMore() {
    if (!current?.nextCursor || paging?.key === key) return;
    const controller = new AbortController(), id = ++sequence.current;
    pageController.current = controller; setPaging({ key, id });
    try {
      const value = await socialRequest("search", { query: mode === "new" ? "" : text, field, mode, cursor: current.nextCursor }, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(old => old?.key === key ? { ...old, users: uniqueUsers([...old.users, ...value.users]), nextCursor: value.nextCursor ?? null, pageError: "" } : old);
    } catch (error) { if (!controller.signal.aborted) setResult(old => old?.key === key ? { ...old, pageError: error.message } : old); }
    finally { setPaging(active => active?.id === id ? null : active); }
  }
  async function relationship(targetUid, operation) {
    if (busy || !online) return;
    const controller = new AbortController(), id = ++sequence.current; mutationController.current = controller;
    const revision = current?.users.find(item => item.uid === targetUid)?.relationship?.revision;
    const attempt = `${key}:${targetUid}:${operation}:${revision ?? ""}`;
    if (!attempts.current.has(attempt)) attempts.current.set(attempt, crypto.randomUUID());
    setAction({ key, uid: targetUid, busy: true, id });
    try {
      const value = await socialRequest("relationship", { targetUid, operation, operationId: attempts.current.get(attempt), ...(Number.isSafeInteger(revision) ? { expectedRevision: revision } : {}) }, { signal: controller.signal });
      if (!controller.signal.aborted) {
        attempts.current.delete(attempt);
        setResult(old => old?.key === key ? { ...old, users: old.users.map(item => item.uid === targetUid ? { ...item, relationship: value.relationship } : item) } : old);
        setAction({ key, busy: false, message: operation === "request" ? "Pozvání bylo odesláno." : operation === "accept" ? "Pozvání bylo přijato." : "Propojení bylo zrušeno." });
      }
    } catch (error) { if (!controller.signal.aborted) { setAction({ key, busy: false, error: error.message }); setRetry(value => value + 1); } }
    finally { setAction(active => active?.id === id ? { ...active, busy: false } : active); }
  }
  function changeSearch(value) { setQuery(value); setMode("search"); }

  return <Layout><div className="social-page fisher-discovery">
    <div className="social-topline"><Link to="/community">← Komunita</Link><Link to="/profile/social">Moje dohledatelnost</Link></div>
    <header><p className="social-eyebrow">Rybářská komunita</p><h1>Najít rybáře</h1><p className="social-help">Vyhledej veřejné rybářské profily. Poloha zařízení ani GPS se nepoužívá.</p></header>
    {!uid ? <section className="social-panel"><h2>Najdi další rybáře</h2><p>Vyhledávání a pozvání vyžadují přihlášení. Tvůj místní deník zůstává zachovaný.</p><Link className="social-primary" to="/login">Přihlásit se</Link></section> : <>
      <section className="social-panel fisher-search-panel" aria-label="Vyhledat rybáře">
        <label htmlFor="fisher-search">Jméno, uživatelské jméno nebo veřejný zájem<input id="fisher-search" type="search" autoComplete="off" autoCapitalize="none" maxLength={40} placeholder="Například Petr, privlac nebo Morava" value={query} onChange={event => changeSearch(event.target.value)} aria-describedby="fisher-search-help" /></label>
        <label htmlFor="fisher-search-field">Hledat v<select id="fisher-search-field" value={field} onChange={event => { setField(event.target.value); setMode("search"); }}><option value="all">Jméno a veřejné údaje</option><option value="interests">Veřejné rybářské zájmy</option><option value="region">Dobrovolně zveřejněný region</option></select></label>
        <p id="fisher-search-help" className="social-help">Zadej alespoň 2 znaky. Stačí začátek jména nebo slova, bez diakritiky a bez rozlišení velikosti písmen.</p>
        <button type="button" aria-pressed={mode === "new"} onClick={() => { setMode("new"); setField("all"); setQuery(""); }}>Noví veřejní rybáři</button>
      </section>
      {action?.key === key && action.message && <p role="status" className="social-success">{action.message}</p>}
      {action?.key === key && action.error && <p role="alert" className="social-error">{action.error}</p>}
      {loading && <p role="status" className="social-panel">Hledám rybáře…</p>}
      {!online && <p className="social-panel social-empty" role="status">Hledání a přátelství vyžadují připojení. Soukromý deník funguje dál offline.</p>}
      {online && !searchable && <p className="social-panel social-empty">Zkus jméno, společný rybářský zájem nebo dobrovolně sdílený region. Přehled nových členů načteš tlačítkem nahoře.</p>}
      {current?.error && <section className="social-panel"><p role="alert" className="social-error">{current.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Zkusit znovu</button></section>}
      {current && !current.error && <section aria-label={mode === "new" ? "Noví veřejní rybáři" : "Výsledky vyhledávání"} aria-live="polite">
        {!current.users.length && <div className="social-panel"><h2>Žádné dostupné profily</h2><p className="social-empty">Zkus jiné jméno nebo začátek slova. Soukromé, skryté a blokované účty do výsledků nezařazujeme.</p></div>}
        <ul className="fisher-results">{current.users.map(profile => {
                    return <li key={profile.uid} className="fisher-result">
            <Link to={`/u/${profile.uid}`} className="fisher-result-avatar" aria-label={`Otevřít profil ${profile.displayName}`}>{profile.avatarVersion ? <SharedImage profile={profile} avatar /> : <span>{profile.displayName?.charAt(0) || "🎣"}</span>}</Link>
            <div className="fisher-result-body"><Link className="fisher-result-name" to={`/u/${profile.uid}`}>{profile.displayName}</Link><p className="social-handle">@{profile.handle}</p><CollaboratorBadge access={profile.badgeRole ? { role: profile.badgeRole } : null} />
              {profile.progression?.level != null && <p className="fisher-result-level">Úroveň {profile.progression.level}{profile.progression.rank ? ` · ${profile.progression.rank}` : ""}</p>}
              {[profile.region, profile.specialization, profile.favoriteSpecies].filter(Boolean).length > 0 && <p className="fisher-result-interests">{[profile.region, profile.specialization, profile.favoriteSpecies].filter(Boolean).join(" · ")}</p>}
            </div>
            {profile.uid !== uid && <div className="fisher-result-actions"><FriendshipActions relationship={profile.relationship} busy={busy} onAction={operation => relationship(profile.uid, operation)} /></div>}
          </li>;
        })}</ul>
        {current.pageError && <><p role="alert" className="social-error">{current.pageError}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Obnovit výsledky</button></>}
        {current.nextCursor && current.users.length < 100 && <button className="fisher-load-more" disabled={paging?.key === key} onClick={loadMore}>{paging?.key === key ? "Načítám…" : "Načíst další rybáře"}</button>}
        {current.nextCursor && current.users.length >= 100 && <p className="social-help">Pro další výsledky upřesni hledání.</p>}
      </section>}
    </>}
  </div></Layout>;
}
