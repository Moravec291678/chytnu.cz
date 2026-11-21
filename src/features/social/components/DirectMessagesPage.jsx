import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../../../shared/layout/Layout.jsx";
import { useAuth } from "../../auth/context/authContextValue.js";
import { socialRequest } from "../data/socialClient.js";
import { useSocialConnection } from "./useSocialConnection.js";
import "./socialProfiles.css";

function Conversation({ uid, targetUid }) {
  const online = useSocialConnection();
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [reportId, setReportId] = useState(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(null);
  const retry = useRef(null);
  const request = useCallback((action, payload, signal) => socialRequest(action, payload, { expectedUid: uid, signal }), [uid]);
  const load = useCallback((cursor, signal) => request(targetUid ? "dm.list" : "dm.conversations", {
    ...(targetUid ? { targetUid } : {}), ...(cursor ? { cursor } : {}),
  }, signal), [request, targetUid]);

  useEffect(() => {
    if (!online) return undefined;
    const controller = new AbortController();
    load(null, controller.signal).then(result => {
      if (!controller.signal.aborted) { setPage(result); setError(""); }
    }).catch(reason => { if (!controller.signal.aborted) { setPage(null); setError(reason.message); } });
    return () => controller.abort();
  }, [load, online]);

  useEffect(() => {
    const clear = () => setPage(null);
    window.addEventListener("offline", clear);
    return () => { window.removeEventListener("offline", clear); running.current?.abort(); };
  }, [online]);

  async function run(operation) {
    if (!online || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true); setError(""); setNotice("");
    try { await operation(controller.signal); }
    catch (reason) { if (!controller.signal.aborted) { setPage(null); setError(reason.message); } }
    finally {
      if (running.current === controller) { running.current = null; setBusy(false); }
    }
  }

  async function reload(signal, older = false) {
    if (!older) setPage(null);
    const data = await load(older ? page.nextCursor : null, signal);
    if (signal.aborted) return;
    const key = targetUid ? "messages" : "conversations";
    const identifier = targetUid ? "id" : "targetUid";
    setPage(previous => ({
      ...data, [key]: older && previous ? [...new Map([...previous[key], ...data[key]].map(row => [row[identifier], row])).values()] : data[key],
    }));
  }

  function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    return run(async signal => {
      if (retry.current?.text !== body) retry.current = { text: body, operationId: crypto.randomUUID() };
      await request("dm.send", { targetUid, ...retry.current }, signal);
      if (signal.aborted) return;
      retry.current = null; setText(""); setNotice("Zpráva byla odeslána.");
      await reload(signal);
    });
  }

  function change(action, payload, message) {
    return run(async signal => {
      await request(action, { targetUid, ...payload }, signal);
      if (signal.aborted) return;
      setReportId(null);
      setNotice(message);
      await reload(signal);
    });
  }

  return <div className="social-page">
    <div className="social-topline"><Link to={targetUid ? "/messages" : "/friends"}>{targetUid ? "← Zprávy" : "← Přátelé"}</Link>
      <button disabled={!online || busy} onClick={() => run(signal => reload(signal))}>Obnovit</button></div>
    <h1>{targetUid ? "Soukromá konverzace" : "Soukromé zprávy"}</h1>
    {!online && <p role="status">Připoj se, abys mohl otevřít nebo odeslat soukromé zprávy.</p>}
    {error && <p role="alert" className="social-error">{error}</p>}
    {notice && <p role="status" className="social-success">{notice}</p>}
    {online && page && <section className="social-panel">
      {targetUid ? <>
        <div className="social-button-row"><Link to={`/u/${encodeURIComponent(targetUid)}`}>Profil příjemce</Link>
          <button disabled={busy || !page.revision} onClick={() => change("dm.read", { revision: page.revision }, "Označeno jako přečtené.")}>Označit jako přečtené</button></div>
        <div role="log" aria-label="Zprávy" style={{ overflowWrap: "anywhere" }}>
          {page.messages.map(item => <article key={item.id} className="social-panel">
            <strong>{item.mine ? "Ty" : "Přítel"}</strong><p>{item.text}</p>
            {item.mine ? <button disabled={busy} onClick={() => change("dm.delete", { messageId: item.id }, "Zpráva byla smazána.")}>Smazat zprávu</button>
              : <button disabled={busy} onClick={() => setReportId(item.id)}>Nahlásit zprávu</button>}
          </article>)}
          {page.messages.length === 0 && <p>Žádné dostupné zprávy.</p>}
        </div>
        {reportId && <form onSubmit={event => {
          event.preventDefault();
          change("dm.report", { messageId: reportId, reason: new FormData(event.currentTarget).get("reason") }, "Hlášení bylo odesláno moderátorům.");
        }}>
          <label>Důvod<select name="reason" required defaultValue=""><option value="">Vyber důvod</option>
            <option value="spam">Spam</option><option value="harassment">Obtěžování</option><option value="inappropriate">Nevhodný obsah</option>
            <option value="privacy">Narušení soukromí</option><option value="other">Jiný důvod</option></select></label>
          <button type="submit" disabled={busy}>Odeslat hlášení</button>
          <button type="button" disabled={busy} onClick={() => setReportId(null)}>Zrušit</button>
        </form>}
        <form onSubmit={send}><label>Zpráva<textarea maxLength={500} value={text} onChange={event => setText(event.target.value)} disabled={busy} /></label>
          <button type="submit" disabled={busy || !text.trim()} className="social-primary">{busy ? "Čekám na potvrzení…" : "Odeslat zprávu"}</button></form>
      </> : <>
        {page.conversations.length === 0 && <p>Zatím nemáš žádné konverzace. Napiš někomu z přátel.</p>}
        <ul>{page.conversations.map(item => <li key={item.targetUid}><Link to={`/messages/${encodeURIComponent(item.targetUid)}`}>
          {item.displayName || "Přítel"}{item.unread ? ` · Nepřečtené (${item.unread})` : ""}</Link></li>)}</ul>
      </>}
      {page.nextCursor && <button disabled={busy} onClick={() => run(signal => reload(signal, true))}>Načíst další</button>}
    </section>}
  </div>;
}

export default function DirectMessagesPage() {
  const { user } = useAuth();
  const { targetUid } = useParams();
  return <Layout>{user?.uid ? <Conversation key={`${user.uid}:${targetUid ?? "inbox"}`} uid={user.uid} targetUid={targetUid} /> : <Link to="/login">Přihlásit se</Link>}</Layout>;
}
