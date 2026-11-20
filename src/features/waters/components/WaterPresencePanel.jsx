import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { socialRequest } from "../../social/data/socialClient.js";

export default function WaterPresencePanel({ ownerId, waterId }) {
  const [confirmed, setConfirmed] = useState(false);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const expiresAt = session?.active ? session.expiresAt : null;
  const isHere = session?.active && session.waterId === waterId;

  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = setTimeout(() => {
      setSession(current => current?.expiresAt === expiresAt ? { active: false } : current);
      setConfirmed(false);
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);

  async function execute(action, input) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      setSession(await socialRequest(action, input, { expectedUid: ownerId }));
      setConfirmed(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section className="catalogue-presence" aria-labelledby="water-presence-heading">
    <h2 id="water-presence-heading">Přítomnost u revíru</h2>
    <p>Potvrzuješ vybraný revír. Aplikace nevyžaduje GPS ani neověřuje tvoji polohu. Přítomnost platí 30 minut a můžeš ji kdykoli ukončit.</p>
    <button type="button" disabled={busy} onClick={() => execute("waterPresence.status")}>Načíst aktuální stav</button>
    {busy && <p role="status">Ověřuji přítomnost…</p>}
    {error && <p role="alert">{error}</p>}
    {session && <div className="catalogue-presence">
      {isHere ? <p role="status">Přítomnost u tohoto revíru platí do {new Date(session.expiresAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}.</p>
        : session.active ? <p role="status">Máš aktivní přítomnost na <Link to={`/waters/catalogue/${session.waterId}`}>jiném revíru</Link>.</p>
        : <p role="status">Přítomnost je vypnutá.</p>}
      {isHere && <button type="button" disabled={busy} onClick={() => execute("waterPresence.refresh", { sessionId: session.sessionId })}>Prodloužit o 30 minut</button>}
      {session.active && <button type="button" disabled={busy} onClick={() => execute("waterPresence.leave", { sessionId: session.sessionId })}>Ukončit přítomnost</button>}
      {!isHere && <>
        <label className="catalogue-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> Potvrzuji, že chci zapnout přítomnost u tohoto revíru.</label>
        <button type="button" disabled={busy || !confirmed} onClick={() => execute("waterPresence.join", { waterId, confirmed, expectedSessionId: session.sessionId ?? null })}>
          {session.active ? "Přesunout přítomnost sem" : "Zapnout přítomnost"}
        </button>
      </>}
    </div>}
  </section>;
}
