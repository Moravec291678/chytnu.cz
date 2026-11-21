import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/authContextValue.js";
import Layout from "../../../shared/layout/Layout.jsx";
import { socialRequest } from "../data/socialClient.js";
import { useSocialConnection } from "./useSocialConnection.js";
import "./socialProfiles.css";

const tabs = { member: "Moje skupiny", invited: "Pozvánky", public: "Veřejné skupiny" };
const roles = { owner: "Správce", moderator: "Moderátor", member: "Člen", invited: "Pozvánka" };

function OnlineCrew({ uid }) {
  const online = useSocialConnection();
  const [tab, setTab] = useState("member");
  const [result, setResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const [name, setName] = useState("");
  const [friend, setFriend] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(null);
  const creation = useRef(null);
  const request = useCallback((action, payload, signal) => socialRequest(action, payload, { expectedUid: uid, signal }), [uid]);

  useEffect(() => {
    if (!online) return undefined;
    const controller = new AbortController();
    request("crew.list", { mode: tab }, controller.signal).then(value => {
      if (!controller.signal.aborted) { setResult({ ...value, tab }); setError(""); }
    }).catch(reason => { if (!controller.signal.aborted) { setResult(null); setError(reason.message); } });
    return () => controller.abort();
  }, [request, tab, online]);

  useEffect(() => {
    const clear = () => { setResult(null); setDetail(null); };
    window.addEventListener("offline", clear);
    return () => { window.removeEventListener("offline", clear); running.current?.abort(); };
  }, [online, tab]);

  async function run(work) {
    if (!online || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true); setError(""); setNotice("");
    try { await work(controller.signal); }
    catch (reason) { if (!controller.signal.aborted) { setDetail(null); setError(reason.message); } }
    finally {
      if (running.current === controller) { running.current = null; setBusy(false); }
    }
  }

  async function load(signal, cursor) {
    const data = await request("crew.list", { mode: tab, ...(cursor ? { cursor } : {}) }, signal);
    if (!signal.aborted) setResult(old => ({
      ...data, tab, crews: cursor && old?.tab === tab ? [...new Map([...old.crews, ...data.crews].map(crew => [crew.id, crew])).values()] : data.crews,
    }));
  }

  function create(event) {
    event.preventDefault();
    const title = name.trim();
    if (!title) return;
    return run(async signal => {
      if (creation.current?.name !== title) creation.current = { name: title, operationId: crypto.randomUUID() };
      await request("crew.create", creation.current, signal);
      if (signal.aborted) return;
      creation.current = null; setName(""); setNotice("Skupina byla vytvořena.");
      await load(signal);
    });
  }

  function change(crew, operation, fields = {}) {
    return run(async signal => {
      await request("crew.change", { crewId: crew.id, expectedRevision: crew.revision, operation, ...fields }, signal);
      if (signal.aborted) return;
      setDetail(null); setNotice("Změna skupiny byla potvrzena.");
      await load(signal);
    });
  }

  function inspect(crew) {
    return run(async signal => {
      const [info, friends] = await Promise.all([
        request("crew.view", { crewId: crew.id }, signal),
        request("friends", { tab: "friends" }, signal),
      ]);
      if (!signal.aborted) { setDetail({ ...info.crew, friends: friends.users }); setFriend(""); }
    });
  }

  const current = result?.tab === tab ? result : null;
  return <div className="social-page">
    <div className="social-topline"><button disabled={!online || busy} onClick={() => run(signal => load(signal))}>Obnovit</button></div>
    <h1>Rybářské skupiny</h1>
    {!online && <p role="status">Rybářské skupiny jsou dostupné s připojením.</p>}
    {error && <p role="alert" className="social-error">{error}</p>}
    {notice && <p role="status" className="social-success">{notice}</p>}
    <nav aria-label="Výběr skupin" className="social-tabs">{Object.entries(tabs).map(([mode, label]) => <button key={mode} type="button" aria-pressed={mode === tab}
      onClick={() => { setDetail(null); setTab(mode); }}>{label}</button>)}</nav>
    {online && tab === "member" && <form className="social-panel" onSubmit={create}>
      <label>Název nové soukromé skupiny<input value={name} maxLength={60} onChange={event => setName(event.target.value)} /></label>
      <button className="social-primary" type="submit" disabled={busy || !name.trim()}>Založit skupinu</button>
    </form>}
    {online && current && <section aria-label={tabs[tab]}>
      {current.crews.length === 0 && <p>V tomto přehledu zatím nejsou žádné skupiny.</p>}
      {current.crews.map(crew => <article key={crew.id} className="social-panel">
        <h2>{crew.name}</h2><p>{crew.visibility === "public" ? "Veřejná" : "Soukromá"} · Členové {crew.memberCount}{crew.role ? ` · ${roles[crew.role]}` : ""}</p>
        <div className="social-button-row">
          {crew.role === "invited" && <><button disabled={busy} onClick={() => change(crew, "accept")}>Přijmout pozvánku</button><button disabled={busy} onClick={() => change(crew, "decline")}>Odmítnout pozvánku</button></>}
          {crew.role && crew.role !== "invited" && <button disabled={busy || (crew.role === "owner" && crew.memberCount > 1)} onClick={() => change(crew, "leave")}>Opustit skupinu</button>}
          {["owner", "moderator"].includes(crew.role) && <button disabled={busy} onClick={() => inspect(crew)}>Spravovat skupinu</button>}
          {crew.role !== "owner" && <details><summary>Nahlásit skupinu</summary><form onSubmit={event => {
            event.preventDefault();
            const reason = new FormData(event.currentTarget).get("reason");
            run(async signal => {
              await request("crew.report", { crewId: crew.id, reason }, signal);
              if (!signal.aborted) setNotice("Hlášení skupiny bylo soukromě odesláno.");
            });
          }}>
            <label>Důvod<select name="reason" required defaultValue=""><option value="">Vyber důvod</option>
              <option value="spam">Spam</option><option value="harassment">Obtěžování</option><option value="inappropriate">Nevhodný obsah</option>
              <option value="privacy">Narušení soukromí</option><option value="other">Jiný důvod</option></select></label>
            <button type="submit" disabled={busy}>Odeslat hlášení</button>
          </form></details>}
        </div>
      </article>)}
      {current.nextCursor && <button disabled={busy} onClick={() => run(signal => load(signal, current.nextCursor))}>Načíst další skupiny</button>}
    </section>}
    {online && detail && <section className="social-panel" aria-label="Správa skupiny"><h2>{detail.name}</h2>
      <form onSubmit={event => { event.preventDefault(); change(detail, "invite", { targetUid: friend }); }}>
        <label>Přítel k pozvání<select value={friend} onChange={event => setFriend(event.target.value)}>
          <option value="">Vyber přítele</option>{detail.friends.filter(row => !detail.members?.some(member => member.uid === row.uid))
            .map(row => <option key={row.uid} value={row.uid}>{row.displayName || "Přítel"}</option>)}</select></label>
        <button type="submit" disabled={busy || !friend}>Pozvat přítele</button>
      </form>
      {detail.role === "owner" && <>
        <button disabled={busy} onClick={() => change(detail, "visibility", { visibility: detail.visibility === "public" ? "private" : "public" })}>
          {detail.visibility === "public" ? "Skrýt ze seznamu veřejných skupin" : "Zveřejnit název a počet členů"}</button>
        <ul>{detail.members?.filter(member => member.uid !== uid).map(member => <li key={member.uid}>
          <strong>{member.displayName || "Člen"}</strong>
          <div className="social-button-row">
            <button disabled={busy} onClick={() => change(detail, "moderator", { targetUid: member.uid, enabled: !member.moderator })}>{member.moderator ? "Odebrat roli moderátora" : "Pověřit moderováním"}</button>
            <button disabled={busy} onClick={() => {
              if (window.confirm("Předat správu skupiny vybranému členovi?")) change(detail, "transfer", { targetUid: member.uid });
            }}>Předat správu</button>
            <button disabled={busy} onClick={() => change(detail, "remove", { targetUid: member.uid })}>Odebrat člena</button>
          </div></li>)}</ul></>}
    </section>}
  </div>;
}

export default function OnlineCrewPage() {
  const { user } = useAuth();
  return <Layout>{user?.uid ? <OnlineCrew key={user.uid} uid={user.uid} /> : <Link to="/login">Přihlásit se</Link>}</Layout>;
}
