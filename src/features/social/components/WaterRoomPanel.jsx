import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest } from "../data/socialClient.js";
import { useSocialConnection } from "./useSocialConnection.js";

export default function WaterRoomPanel({ waterId, uid }) {
  const online = useSocialConnection();
  const [membership, setMembership] = useState(null);
  const [page, setPage] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reportId, setReportId] = useState(null);
  const pending = useRef(null);
  const retry = useRef(null);
  const statusRequest = useCallback(async signal => {
    const current = await socialRequest("waterPresence.status", {}, { expectedUid: uid, signal });
    if (signal.aborted) return;
    setMembership(current);
    setPage(null);
    if (current.active && current.waterId === waterId) {
      const result = await socialRequest("waterChat.list", { waterId, sessionId: current.sessionId }, { expectedUid: uid, signal });
      if (!signal.aborted) setPage(result);
    }
  }, [uid, waterId]);

  useEffect(() => {
    if (!online) return undefined;
    const controller = new AbortController();
    Promise.resolve().then(() => statusRequest(controller.signal)).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message);
    });
    return () => controller.abort();
  }, [online, statusRequest]);

  useEffect(() => () => pending.current?.abort(), [online]);

  useEffect(() => {
    const discardPage = () => setPage(null);
    window.addEventListener("offline", discardPage);
    return () => window.removeEventListener("offline", discardPage);
  }, []);

  const sessionId = membership?.active && membership.waterId === waterId ? membership.sessionId : null;
  useEffect(() => {
    if (!sessionId) return undefined;
    const timer = setTimeout(() => {
      pending.current?.abort();
      setMembership(null);
      setPage(null);
      setNotice("Přítomnost vypršela. Pro další čtení nebo odeslání znovu potvrď revír.");
    }, Math.max(0, membership.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [membership, sessionId]);

  async function run(work) {
    if (!online || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    const call = (action, input) => socialRequest(action, input, { expectedUid: uid, signal: controller.signal });
    try { await work(call, controller.signal); }
    catch (reason) { if (!controller.signal.aborted) setError(reason.message); }
    finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  function join() {
    return run(async (call, signal) => {
      const current = await call("waterPresence.join", { waterId, confirmed: true, expectedSessionId: membership?.sessionId ?? null });
      if (signal.aborted) return;
      setMembership(current);
      setPage(null);
      const result = await call("waterChat.list", { waterId, sessionId: current.sessionId });
      if (!signal.aborted) setPage(result);
    });
  }

  function leave() {
    return run(async (call, signal) => {
      await call("waterPresence.leave", { sessionId });
      if (signal.aborted) return;
      setMembership({ active: false });
      setPage(null);
    });
  }

  function load(older = false) {
    if (!older) {
      return run((_call, signal) => statusRequest(signal));
    }
    return run(async (call, signal) => {
      const result = await call("waterChat.list", { waterId, sessionId, cursor: page.nextCursor });
      if (signal.aborted) return;
      setPage(previous => ({ ...result, messages: [...new Map([...previous.messages, ...result.messages].map(row => [row.id, row])).values()] }));
    });
  }

  function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || !sessionId) return;
    return run(async (call, signal) => {
      if (retry.current?.text !== body) retry.current = { text: body, operationId: crypto.randomUUID() };
      await call("waterChat.send", { ...retry.current, waterId, sessionId });
      if (signal.aborted) return;
      retry.current = null;
      setText("");
      setNotice("Zpráva byla odeslána.");
      await statusRequest(signal);
    });
  }

  function report(event) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason");
    return run(async (call, signal) => {
      await call("waterChat.report", { waterId, sessionId, messageId: reportId, reason });
      if (signal.aborted) return;
      setReportId(null);
      setNotice("Hlášení bylo soukromě odesláno moderátorům.");
    });
  }

  return <section aria-label="Online chat revíru" className="water-chat-backend-state water-chat-online">
    <h2>Online chat revíru</h2>
    <p>Vstup do chatu potvrzuješ ručně. Tvoje přesná poloha se nesdílí. Vstup platí 30 minut.</p>
    {!online && <p role="status">Jsi offline. Zprávy načteš po připojení. Rozepsaný text zůstává v této obrazovce.</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button type="button" disabled={!online || busy} onClick={() => load()}>Obnovit stav a zprávy</button>
    {online && !sessionId && <button type="button" disabled={busy || !membership} onClick={join}>
      {membership?.active ? "Přejít do chatu tohoto revíru" : "Potvrdit revír a vstoupit do chatu"}
    </button>}
    {online && sessionId && <>
      <button type="button" disabled={busy} onClick={leave}>Ukončit přítomnost</button>
      <div className="water-chat-messages" role="log" aria-label="Online zprávy revíru">
        {page?.messages.map(message => <article key={message.id} className="water-chat-bubble">
          <strong>{message.author.displayName}</strong>
          <p className="water-chat-bubble-text">{message.text}</p>
          <time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleString("cs-CZ")}</time>
          <button type="button" disabled={busy} onClick={() => setReportId(message.id)}>Nahlásit zprávu</button>
        </article>)}
        {page?.messages.length === 0 && <p>V tomto revíru zatím nejsou dostupné žádné zprávy.</p>}
      </div>
      {page?.nextCursor && <button type="button" disabled={busy} onClick={() => load(true)}>Načíst starší zprávy</button>}
      {reportId && <form onSubmit={report}>
        <label>Důvod hlášení<select name="reason" required defaultValue="">
          <option value="">Vyber důvod</option><option value="spam">Spam</option><option value="harassment">Obtěžování</option>
          <option value="inappropriate">Nevhodný obsah</option><option value="privacy">Narušení soukromí</option><option value="other">Jiný důvod</option>
        </select></label>
        <button type="submit" disabled={busy}>Odeslat hlášení</button>
        <button type="button" disabled={busy} onClick={() => setReportId(null)}>Zrušit</button>
      </form>}
      <form onSubmit={send}>
        <label>Online zpráva<textarea maxLength={500} value={text} disabled={busy} onChange={event => setText(event.target.value)} /></label>
        <button type="submit" disabled={busy || !text.trim() || !page}>{busy ? "Čekám na potvrzení…" : "Odeslat online zprávu"}</button>
      </form>
    </>}
  </section>;
}
