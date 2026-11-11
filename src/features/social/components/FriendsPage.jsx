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

const tabs = { friends: "Moji přátelé", incoming: "Příchozí pozvání", outgoing: "Odeslaná pozvání" };
const unique = rows => [...new Map(rows.map(row => [row.uid, row])).values()];
export default function FriendsPage() {
  const { user } = useAuth(), uid = user?.uid;
  const online = useSocialConnection();
  const [tab, setTab] = useState("friends"), [revision, setRevision] = useState(0), [result, setResult] = useState(null), [action, setAction] = useState(null), [paging, setPaging] = useState(null);
  const mutation = useRef(null), pageRequest = useRef(null), operations = useRef(new Map()), sequence = useRef(0);
  const key = `${uid ?? "guest"}:${tab}:${online}`, current = result?.key === key ? result : null, busy = action?.key === key && action.busy;
  useEffect(() => {
    if (!uid || !online) return undefined;
    pageRequest.current?.abort();
    const controller = new AbortController();
    socialRequest("friends", { tab }, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setResult({ key, ...value }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }); });
    return () => controller.abort();
  }, [uid, tab, key, revision, online]);
  useEffect(() => () => { mutation.current?.abort(); pageRequest.current?.abort(); }, [key]);
  useEffect(() => {
    const refresh = () => { if (uid && !busy && document.visibilityState === "visible" && navigator.onLine !== false) setRevision(value => value + 1); };
    const timer = setInterval(refresh, 45_000); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [uid, busy]);
  async function perform(profile, operation) {
    if (busy || !online) return;
    const controller = new AbortController(), id = ++sequence.current; mutation.current = controller;
    const operationKey = `${key}:${profile.uid}:${operation}:${profile.relationship?.revision ?? ""}`;
    if (!operations.current.has(operationKey)) operations.current.set(operationKey, crypto.randomUUID());
    setAction({ key, id, busy: true });
    try {
      await socialRequest("relationship", { targetUid: profile.uid, operation, operationId: operations.current.get(operationKey), ...(Number.isSafeInteger(profile.relationship?.revision) ? { expectedRevision: profile.relationship.revision } : {}) }, { signal: controller.signal });
      if (!controller.signal.aborted) { operations.current.delete(operationKey); setAction({ key, message: "Změna byla potvrzena serverem." }); setRevision(value => value + 1); }
    } catch (error) { if (!controller.signal.aborted) { setAction({ key, error: error.message }); setRevision(value => value + 1); } }
    finally { setAction(active => active?.id === id ? { ...active, busy: false } : active); }
  }
  async function more() {
    if (!online || !current?.nextCursor || paging?.key === key) return;
    const controller = new AbortController(), id = ++sequence.current; pageRequest.current = controller; setPaging({ key, id });
    try { const value = await socialRequest("friends", { tab, cursor: current.nextCursor }, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(old => old?.key === key ? { ...old, users: unique([...old.users, ...value.users]), nextCursor: value.nextCursor, pageError: "" } : old);
    } catch (error) { if (!controller.signal.aborted) setResult(old => old?.key === key ? { ...old, pageError: error.message } : old); }
    finally { setPaging(active => active?.id === id ? null : active); }
  }
  return <Layout><div className="social-page friends-page"><div className="social-topline"><Link to="/profile">← Můj profil</Link><button onClick={() => setRevision(value => value + 1)} disabled={busy}>Obnovit</button></div>
    <header><p className="social-eyebrow">Spojení mezi účty</p><h1>Přátelé</h1><p className="social-help">Přátelství platí až po potvrzení serverem. Stav se při otevřené stránce průběžně obnovuje.</p></header>
    {!uid ? <section className="social-panel"><p>Přátelé vyžadují přihlášení. Místní deník zůstává dostupný.</p><Link className="social-primary" to="/login">Přihlásit se</Link></section> : <>
      <div className="social-button-row"><Link className="social-primary" to="/community/find">Najít přátele</Link></div>
      <p className="social-help">Další rybáře můžeš objevit podle veřejných zájmů nebo v přehledu nových členů.</p>
      <nav className="social-tabs" aria-label="Přehled přátelství">{Object.entries(tabs).map(([id, title]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{title}</button>)}</nav>
      {action?.key === key && action.message && <p role="status" className="social-success">{action.message}</p>}{action?.key === key && action.error && <p role="alert" className="social-error">{action.error}</p>}
      {!online && <p role="status" className="social-panel">Přátelé jsou dostupní online. Poslední stav teď nelze ověřit; soukromý deník funguje dál.</p>}
      {online && !current && <p role="status" className="social-panel">Načítám propojení…</p>}
      {current?.error && <p role="alert" className="social-error">{current.error}</p>}
      {current?.users && <section aria-label={tabs[tab]}><p className="social-help">{current.users.length ? `Načteno ${current.users.length} propojení${current.nextCursor ? "; další lze načíst níže" : ""}.` : "V tomto přehledu zatím žádné propojení není."}</p>
        <ul className="fisher-results">{current.users.map(profile => <li className="fisher-result" key={profile.uid}><Link className="fisher-result-avatar" to={`/u/${profile.uid}`} aria-label={`Otevřít profil ${profile.displayName}`}>{profile.avatarVersion ? <SharedImage profile={profile} avatar /> : <span>{profile.displayName?.charAt(0) || "🎣"}</span>}</Link><div className="fisher-result-body"><Link className="fisher-result-name" to={`/u/${profile.uid}`}>{profile.displayName || "Rybář"}</Link><p className="social-handle">{profile.handle ? `@${profile.handle}` : ""}</p><CollaboratorBadge access={profile.badgeRole ? { role: profile.badgeRole } : null} /><FriendshipActions relationship={profile.relationship} busy={busy} onAction={operation => perform(profile, operation)} /></div></li>)}</ul>
        {current.pageError && <><p role="alert" className="social-error">{current.pageError}</p><button onClick={() => setRevision(value => value + 1)}>Obnovit přehled</button></>}{current.nextCursor && current.users.length < 100 && <button className="fisher-load-more" disabled={paging?.key === key} onClick={more}>{paging?.key === key ? "Načítám…" : "Načíst další"}</button>}
      </section>}
    </>}
  </div></Layout>;
}
