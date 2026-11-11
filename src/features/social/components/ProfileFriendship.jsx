import { useEffect, useRef, useState } from "react";
import { socialRequest } from "../data/socialClient.js";
import FriendshipActions from "./FriendshipActions.jsx";
import { useSocialConnection } from "./useSocialConnection.js";
import { FriendProgressionComparison } from "./PublicProgression.jsx";

export default function ProfileFriendship({ viewerUid, targetUid, profileAvailable, refreshKey = 0, onChanged }) {
  const online = useSocialConnection();
  const key = `${viewerUid}:${targetUid}:${online}`;
  const [result, setResult] = useState(null), [revision, setRevision] = useState(0), [action, setAction] = useState(null);
  const mutation = useRef(null), attempts = useRef(new Map()), sequence = useRef(0);
  const current = result?.key === key ? result : null, busy = action?.key === key && action.busy;
  useEffect(() => {
    if (!online) return undefined;
    const controller = new AbortController();
    socialRequest("friends.status", { targetUid }, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setResult({ key, ...value }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }); });
    return () => controller.abort();
  }, [key, targetUid, revision, refreshKey, online]);
  useEffect(() => () => mutation.current?.abort(), [key]);
  useEffect(() => {
    const refresh = () => { if (!busy && document.visibilityState === "visible" && navigator.onLine !== false) setRevision(value => value + 1); };
    const timer = setInterval(refresh, 45_000); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [busy]);
  async function perform(operation) {
    if (busy || !online || !current?.relationship) return;
    const controller = new AbortController(), id = ++sequence.current; mutation.current = controller;
    const expectedRevision = current.relationship.revision, attempt = `${key}:${operation}:${expectedRevision ?? ""}`;
    if (!attempts.current.has(attempt)) attempts.current.set(attempt, crypto.randomUUID());
    setAction({ key, busy: true, id });
    try {
      const value = operation === "unblock"
        ? await socialRequest("block", { targetUid, blocked: false }, { signal: controller.signal })
        : await socialRequest("relationship", { targetUid, operation, operationId: attempts.current.get(attempt), ...(Number.isSafeInteger(expectedRevision) ? { expectedRevision } : {}) }, { signal: controller.signal });
      if (!controller.signal.aborted) { attempts.current.delete(attempt); if (operation === "unblock") setRevision(value => value + 1); else setResult({ key, ...value }); setAction({ key, message: "Stav propojení byl potvrzen serverem." }); onChanged?.(); }
    } catch (error) { if (!controller.signal.aborted) { setAction({ key, error: error.message }); setRevision(value => value + 1); } }
    finally { setAction(active => active?.id === id ? { ...active, busy: false } : active); }
  }
  const relation = current?.relationship;
  if (!profileAvailable && (!relation || relation.status === "none")) return null;
  return <section className="social-panel profile-friendship" aria-label="Přátelství"><h2>Přátelství</h2>
    {!online && <p role="status">Stav přátelství nelze bez připojení ověřit.</p>}{online && !current && <p role="status">Načítám propojení…</p>}{current?.error && profileAvailable && <p className="social-error" role="alert">{current.error}</p>}
    {relation && <FriendshipActions relationship={relation} busy={busy} onAction={perform} />}
    {relation?.status === "blocked" && <button disabled={busy || !online} onClick={() => perform("unblock")}>Zrušit blokování</button>}
    {online && profileAvailable && relation?.status === "friends" && <FriendProgressionComparison viewerUid={viewerUid} targetUid={targetUid} refreshKey={`${refreshKey}:${relation.revision}`} />}
    {action?.key === key && action.message && <p role="status" className="social-success">{action.message}</p>}{action?.key === key && action.error && <p role="alert" className="social-error">{action.error}</p>}
  </section>;
}
