import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/authContextValue.js";
import CollaboratorBadge from "../../admin/CollaboratorBadge.jsx";
import { socialRequest } from "../data/socialClient.js";
import { SharedImage } from "./SharedImage.jsx";
import { useSocialConnection } from "./useSocialConnection.js";
import "./socialInteractions.css";

const REACTIONS = [
  { kind: "respect", icon: "🎣", label: "Respekt" },
  { kind: "amazing", icon: "🔥", label: "Paráda" },
  { kind: "trophy", icon: "👑", label: "Trofej" },
  { kind: "atmosphere", icon: "🌊", label: "Atmosféra" },
];
const REASONS = [["spam", "Spam"], ["harassment", "Obtěžování"], ["inappropriate", "Nevhodný obsah"], ["suspicious_catch", "Podezřelý úlovek"], ["privacy", "Narušení soukromí"], ["other", "Jiný důvod"]];
function CommentDate({ value }) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? <time dateTime={date.toISOString()}>{date.toLocaleDateString("cs-CZ")}</time> : null;
}

/** Pure presentation: only server-returned counts and identity are displayed. */
export function SocialInteractionsPanel({ data, uid, online = true, loading, error, busy, actionError, message, text = "", editing, report, commentsOpen, onCommentsToggle, onReaction, onText, onSave, onEdit, onCancelEdit, onDelete, onMore, onReload, onReport, onReportChange, onReportSubmit, onReportClose }) {
  const disabled = !uid || !online || busy || !data;
  return <section className="social-interactions" aria-label="Reakce a komentáře">
    <div className="social-reaction-options" aria-label="Vyber jednu rybářskou reakci">{REACTIONS.map(item => <button type="button" key={item.kind} disabled={disabled} aria-pressed={data?.myReaction === item.kind} onClick={() => onReaction(data?.myReaction === item.kind ? null : item.kind)}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span>{Number.isSafeInteger(data?.counts?.[item.kind]) && <strong>{data.counts[item.kind]}</strong>}</button>)}</div>
    {!uid ? <p className="social-interaction-hint">Pro reakce a komentáře se <Link to="/profile">přihlas</Link>.</p> : !online ? <p className="social-interaction-hint" role="status">Reakce a komentáře vyžadují připojení.</p> : loading ? <p className="social-interaction-hint" role="status">Načítám reakce a komentáře…</p> : error ? <div className="social-interaction-error" role="alert"><p>{error}</p><button type="button" onClick={onReload}>Zkusit znovu</button></div> : null}
    {uid && online && data && <>
      <details className="social-comment-section" open={commentsOpen} onToggle={event => onCommentsToggle(event.currentTarget.open)}><summary>Komentáře{Number.isSafeInteger(data.commentCount) ? ` (${data.commentCount})` : ""}</summary>
        <div className="social-comments-body">
          <form className="social-comment-form" onSubmit={onSave}><label>{editing ? "Upravit můj komentář" : "Napsat komentář"}<textarea required maxLength={500} value={text} disabled={busy} onChange={event => onText(event.target.value)} /></label><div><button type="submit" disabled={busy || !text.trim()}>{busy ? "Ukládám…" : editing ? "Uložit změnu" : "Odeslat komentář"}</button>{editing && <button type="button" disabled={busy} onClick={onCancelEdit}>Zrušit úpravu</button>}</div></form>
          {data.comments?.length ? <ol className="social-comment-list">{data.comments.map(comment => <li key={comment.id}>
            <header><Link className="social-comment-author" to={`/u/${encodeURIComponent(comment.author.uid)}`}><span className="social-comment-avatar" aria-hidden="true">{comment.author.avatarVersion ? <SharedImage profile={comment.author} avatar /> : comment.author.displayName?.charAt(0) || "🎣"}</span><strong>{comment.author.displayName}</strong></Link><CollaboratorBadge access={comment.author.badgeRole ? { role: comment.author.badgeRole } : null} /><CommentDate value={comment.createdAt} /></header>
            <p className="social-comment-text">{comment.text}</p><div className="social-comment-actions">{comment.author.uid === uid && <><button type="button" disabled={busy} onClick={() => onEdit(comment)}>Upravit</button><button type="button" disabled={busy} onClick={() => onDelete(comment)}>Smazat</button></>}<button type="button" disabled={busy} onClick={() => onReport(comment.id)}>Nahlásit</button></div>
          </li>)}</ol> : <p className="social-interaction-hint">{data.nextCursor ? "V této části nejsou dostupné komentáře. Pokračuj na další část." : "Zatím žádné dostupné komentáře."}</p>}
          {data.nextCursor && <button type="button" disabled={busy} onClick={onMore}>{busy ? "Načítám…" : "Načíst další komentáře"}</button>}
        </div>
      </details>
      <button className="social-report-toggle" type="button" disabled={busy} onClick={() => onReport(null)}>Nahlásit příspěvek</button>
    </>}
    {report && uid && online && data && <form className="social-report-form" onSubmit={onReportSubmit}><h4>{report.commentId ? "Nahlásit komentář" : "Nahlásit příspěvek"}</h4><label>Důvod<select required disabled={busy} value={report.reason} onChange={event => onReportChange({ ...report, reason: event.target.value })}><option value="">Vyber důvod</option>{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Upřesnění (nepovinné)<textarea maxLength={500} disabled={busy} value={report.details} onChange={event => onReportChange({ ...report, details: event.target.value })} /></label><p className="social-interaction-hint">Hlášení není veřejné. Nepřidávej zbytečné osobní údaje.</p><div><button type="submit" disabled={busy || !report.reason}>{busy ? "Odesílám…" : "Odeslat hlášení"}</button><button type="button" disabled={busy} onClick={onReportClose}>Zrušit</button></div></form>}
    {actionError && <p className="social-interaction-error" role="alert">{actionError}</p>}{message && <p className="social-interaction-hint" role="status">{message}</p>}
  </section>;
}

function SocialInteractionsSession({ postId, revision, uid, onDraftChange }) {
  const online = useSocialConnection();
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  const [result, setResult] = useState(null), [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [text, setText] = useState(""), [editing, setEditing] = useState(null), [report, setReport] = useState(null);
  const [commentId, setCommentId] = useState(() => crypto.randomUUID());
  const ref = useRef(null), loadRef = useRef(null), actionRef = useRef(null), reactionOperationRef = useRef(null);
  const busy = Boolean(action?.busy);
  const current = online && result?.refresh === refresh ? result : null;
  const reload = useCallback(() => { loadRef.current?.abort(); setResult(null); setRefresh(value => value + 1); }, []);
  useEffect(() => {
    if (!ref.current || visible || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "100px" });
    observer.observe(ref.current); return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || !uid || !online) return undefined;
    const controller = new AbortController(); loadRef.current = controller;
    socialRequest("interactions.list", { postId }, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setResult({ ...value, refresh }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ error: error.message, refresh }); });
    return () => { controller.abort(); loadRef.current?.abort(); };
  }, [postId, revision, uid, visible, online, refresh]);
  useEffect(() => () => { loadRef.current?.abort(); actionRef.current?.abort(); }, []);
  useEffect(() => {
    const revalidate = () => { if (document.visibilityState !== "hidden") reload(); };
    const disconnect = () => { actionRef.current?.abort(); reload(); };
    const timer = visible && uid && online ? setInterval(revalidate, 45_000) : null;
    window.addEventListener("focus", revalidate); document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("offline", disconnect); window.addEventListener("online", reload);
    return () => { if (timer) clearInterval(timer); window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); window.removeEventListener("offline", disconnect); window.removeEventListener("online", reload); };
  }, [reload, visible, uid, online]);
  useEffect(() => { onDraftChange?.(Boolean(text.trim() || editing || report)); }, [text, editing, report, onDraftChange]);
  useEffect(() => () => onDraftChange?.(false), [onDraftChange]);
  async function mutate(name, payload, success) {
    if (!uid || !online || busy || !current || current.error) return;
    const controller = new AbortController(); actionRef.current = controller;
    setAction({ busy: true });
    try {
      await socialRequest(name, { postId, ...payload }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      success?.(); setAction({ message: name === "reports.create" ? "Hlášení bylo soukromě odesláno k posouzení." : name === "comments.delete" ? "Komentář byl odstraněn." : name === "comments.save" ? "Komentář byl uložen." : "Reakce byla uložena." });
      reload();
    } catch (error) {
      if (!controller.signal.aborted) { setAction({ error: error.message }); reload(); }
    }
  }
  function react(kind) {
    if (!reactionOperationRef.current || reactionOperationRef.current.kind !== kind) reactionOperationRef.current = { kind, operationId: crypto.randomUUID() };
    mutate("reactions.set", reactionOperationRef.current, () => { reactionOperationRef.current = null; });
  }
  async function more() {
    if (!current?.nextCursor || busy || !online) return;
    const controller = new AbortController(); loadRef.current?.abort(); loadRef.current = controller; setAction({ busy: true });
    try {
      const value = await socialRequest("interactions.list", { postId, cursor: current.nextCursor }, { signal: controller.signal });
      if (!controller.signal.aborted) { setResult(old => old?.refresh === refresh ? { ...value, refresh, comments: [...new Map([...(old.comments ?? []), ...value.comments].map(comment => [comment.id, comment])).values()] } : old); setAction(null); }
    } catch (error) { if (!controller.signal.aborted) { setAction({ error: error.message }); reload(); } }
  }
  function save(event) {
    event.preventDefault(); if (!text.trim()) return;
    mutate("comments.save", { commentId: editing?.id ?? commentId, text: text.trim(), expectedRevision: editing?.revision ?? 0 }, () => { setText(""); setEditing(null); setCommentId(crypto.randomUUID()); });
  }
  return <div ref={ref}><SocialInteractionsPanel data={current && !current.error ? current : null} uid={uid} online={online} loading={Boolean(uid && visible && !current)} error={current?.error} busy={busy} actionError={action?.error} message={action?.message} text={text} editing={editing} report={report} commentsOpen={commentsOpen} onCommentsToggle={setCommentsOpen} onReaction={react} onText={setText} onSave={save} onEdit={comment => { setEditing(comment); setText(comment.text); }} onCancelEdit={() => { setEditing(null); setText(""); }} onDelete={comment => mutate("comments.delete", { commentId: comment.id, expectedRevision: comment.revision }, () => { if (editing?.id === comment.id) { setEditing(null); setText(""); } })} onMore={more} onReload={reload} onReport={id => setReport({ commentId: id, reason: "", details: "" })} onReportChange={setReport} onReportClose={() => setReport(null)} onReportSubmit={event => { event.preventDefault(); if (report?.reason) mutate("reports.create", { ...(report.commentId ? { commentId: report.commentId } : {}), reason: report.reason, ...(report.details.trim() ? { details: report.details.trim() } : {}) }, () => setReport(null)); }} /></div>;
}

export default function SocialInteractions({ post, onDraftChange }) {
  const { user } = useAuth();
  const uid = user?.uid;
  return <SocialInteractionsSession key={`${uid ?? "anonymous"}:${post.id}:${post.revision}`} postId={post.id} revision={post.revision} uid={uid} onDraftChange={onDraftChange} />;
}
