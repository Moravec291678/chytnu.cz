import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { getCatchRarity } from "../features/catches/utils/rarity.js";
import {
  COMMUNITY_COMMENT_MAX_LENGTH,
  COMMUNITY_REACTION_TYPES,
  COMMUNITY_REPORT_REASONS,
  communityInteractionRepository,
} from "../features/community/data/communityInteractionRepository.js";
import { createPublicCatchProjection } from "../features/privacy/data/privacyModel.js";
import { DEFAULT_SPECIES } from "../shared/constants/constants.js";
import Layout from "../shared/layout/Layout";
import "./CommunityCatchDetailPage.css";

const REACTION_LABELS = Object.freeze({ like: "👍 Líbí", wow: "😮 Wow", trophy: "🏆 Trofej" });

function formatDateTime(value) {
  if (!Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function CommunityCatchDetailPage() {
  const { catchId } = useParams();
  const auth = useAuth();
  const scope = useDataScope();
  const { state } = useCatches();
  const record = state.catches.find((item) => item.id === catchId);
  const projection = useMemo(() => record ? createPublicCatchProjection(record) : null, [record]);
  const rarity = record && projection ? getCatchRarity(record, DEFAULT_SPECIES) : null;
  const interactionScope = useMemo(() => ({ scopeKey: scope.scopeKey, ownerId: scope.ownerId }), [scope.ownerId, scope.scopeKey]);
  const profileName = auth.user?.displayName?.trim() || (auth.user ? "Můj profil" : "Místní profil");
  const [comments, setComments] = useState([]);
  const [reaction, setReaction] = useState(null);
  const [storedReport, setStoredReport] = useState(null);
  const [interactionLoading, setInteractionLoading] = useState(true);
  const [interactionError, setInteractionError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (scope.status !== "ready" || !projection) return () => { active = false; };
    Promise.resolve().then(() => {
      if (!active) return null;
      setInteractionLoading(true);
      setInteractionError("");
      return Promise.all([
        communityInteractionRepository.listComments(catchId, interactionScope),
        communityInteractionRepository.getOwnReaction(catchId, interactionScope),
        communityInteractionRepository.getOwnReport(catchId, interactionScope),
      ]);
    }).then((result) => {
      if (!result) return;
      const [loadedComments, loadedReaction, loadedReport] = result;
      if (!active) return;
      setComments(loadedComments);
      setReaction(loadedReaction);
      setStoredReport(loadedReport);
      setReportReason(loadedReport?.reason || "");
    }).catch((error) => {
      if (active) setInteractionError(error?.message || "Místní interakce se nepodařilo načíst.");
    }).finally(() => {
      if (active) setInteractionLoading(false);
    });
    return () => { active = false; };
  }, [catchId, interactionScope, projection, scope.status]);

  async function submitComment(event) {
    event.preventDefault();
    if (commentBusy) return;
    const text = commentText.trim();
    if (!text) {
      setInteractionError("Komentář nesmí být prázdný.");
      return;
    }
    setCommentBusy(true);
    setInteractionError("");
    try {
      const comment = await communityInteractionRepository.createComment({ catchId, text, author: profileName, scope: interactionScope });
      setComments((current) => [...current, comment]);
      setCommentText("");
    } catch (error) {
      setInteractionError(error?.message || "Komentář se nepodařilo uložit.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function deleteComment(commentId) {
    if (commentBusy) return;
    setCommentBusy(true);
    setInteractionError("");
    try {
      await communityInteractionRepository.deleteOwnComment(commentId, interactionScope);
      setComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch (error) {
      setInteractionError(error?.message || "Komentář se nepodařilo smazat.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function toggleReaction(type) {
    if (reactionBusy) return;
    setReactionBusy(true);
    setInteractionError("");
    try {
      const next = await communityInteractionRepository.setOwnReaction({
        catchId,
        type: reaction?.type === type ? null : type,
        scope: interactionScope,
      });
      setReaction(next);
    } catch (error) {
      setInteractionError(error?.message || "Reakci se nepodařilo uložit.");
    } finally {
      setReactionBusy(false);
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!reportReason || reportBusy) return;
    setReportBusy(true);
    setInteractionError("");
    try {
      const report = await communityInteractionRepository.createReport({ catchId, reason: reportReason, scope: interactionScope });
      setStoredReport(report);
      setReportOpen(false);
      setReportMessage("Hlášení bylo skutečně uloženo lokálně se stavem čeká na odeslání.");
    } catch (error) {
      setInteractionError(error?.message || "Hlášení se nepodařilo uložit.");
    } finally {
      setReportBusy(false);
    }
  }

  if (state.loading) return <Layout><main className="community-detail-page"><p className="loading-state" role="status">Načítám bezpečný náhled…</p></main></Layout>;
  if (state.error) return <Layout><main className="community-detail-page"><section className="community-detail-state" role="alert"><h1>Úlovek se nepodařilo načíst</h1><p>{state.error}</p><Link to="/community">Zpět do komunity</Link></section></main></Layout>;
  if (!record || !projection) return <Layout><main className="community-detail-page"><section className="community-detail-state"><h1>Veřejný náhled není dostupný</h1><p>Úlovek neexistuje nebo už není označený jako veřejný.</p><Link to="/community">Zpět do komunity</Link></section></main></Layout>;

  const formattedDate = formatDateTime(projection.caughtAt);
  const storedReasonLabel = COMMUNITY_REPORT_REASONS.find((item) => item.id === storedReport?.reason)?.label;

  return (
    <Layout>
      <main className="community-detail-page">
        <header className="community-detail-header">
          <Link to="/community">← Komunita</Link>
          <span>DEV · LOCAL PUBLIC-SAFE PREVIEW</span>
          <div className="community-detail-title-row"><h1>{projection.species}</h1>{rarity && <b>{rarity.label}</b>}</div>
          <p>{profileName}</p>
        </header>

        {projection.photos[0]?.publicUrl && <img className="community-detail-photo" src={projection.photos[0].publicUrl} alt={`Veřejná fotografie úlovku ${projection.species}`} />}

        <section className="community-detail-metrics" aria-label="Údaje úlovku">
          {projection.lengthCm !== null && <div><strong>{projection.lengthCm.toLocaleString("cs-CZ")} cm</strong><span>Délka</span></div>}
          {projection.weightKg !== null && <div><strong>{projection.weightSource === "estimated" ? "≈ " : ""}{projection.weightKg.toLocaleString("cs-CZ")} kg</strong><span>Váha{projection.weightSource === "estimated" ? " · odhad" : ""}</span></div>}
          {formattedDate && <div><strong>{formattedDate}</strong><span>Datum</span></div>}
        </section>

        {projection.locationArea && <p className="community-detail-area">Přibližná oblast: {projection.locationArea}</p>}

        <section className="community-detail-section" aria-labelledby="community-reactions-title">
          <div className="community-detail-section-heading"><h2 id="community-reactions-title">Moje lokální reakce</h2><span>1 profil · bez veřejného počtu</span></div>
          <div className="community-reactions">
            {COMMUNITY_REACTION_TYPES.map((type) => (
              <button type="button" aria-pressed={reaction?.type === type} disabled={reactionBusy || interactionLoading} onClick={() => toggleReaction(type)} key={type}>{REACTION_LABELS[type]}</button>
            ))}
          </div>
        </section>

        <section className="community-detail-section" aria-labelledby="community-comments-title">
          <div className="community-detail-section-heading"><h2 id="community-comments-title">Komentáře ({comments.length})</h2><span>LOCAL/DEV</span></div>
          {interactionLoading ? <p className="loading-state" role="status">Načítám komentáře…</p> : comments.length === 0 ? <p className="community-comments-empty">Zatím žádné lokální komentáře.</p> : (
            <div className="community-comments-list">
              {comments.map((comment) => (
                <article key={comment.id}>
                  <div><strong>{comment.author}</strong>{formatDateTime(comment.createdAt) && <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>}</div>
                  <p>{comment.text}</p>
                  <button type="button" disabled={commentBusy} onClick={() => deleteComment(comment.id)}>Smazat vlastní</button>
                </article>
              ))}
            </div>
          )}
          <form className="community-comment-form" onSubmit={submitComment}>
            <label htmlFor="community-comment">Přidat lokální komentář</label>
            <textarea id="community-comment" value={commentText} maxLength={COMMUNITY_COMMENT_MAX_LENGTH} onChange={(event) => { setCommentText(event.target.value); if (interactionError) setInteractionError(""); }} placeholder="Napiš komentář…" />
            <div><span>{commentText.length}/{COMMUNITY_COMMENT_MAX_LENGTH}</span><button type="submit" disabled={commentBusy || interactionLoading || !commentText.trim()}>{commentBusy ? "Ukládám…" : "Přidat komentář"}</button></div>
          </form>
        </section>

        {interactionError && <p className="community-detail-error" role="alert">{interactionError}</p>}
        {reportMessage && <p className="community-detail-status" role="status">{reportMessage}</p>}
        {storedReasonLabel && <p className="community-detail-report-state">Lokální hlášení: <strong>{storedReasonLabel}</strong> · čeká na backend</p>}

        <button className="community-report-open" type="button" onClick={() => setReportOpen(true)}>Nahlásit obsah</button>

        <aside className="community-detail-privacy">
          <strong>Privacy-safe náhled</strong>
          <p>Přesná GPS, soukromé místo, neveřejné poznámky, scopeKey, vlastník, Trip a sync metadata nejsou součástí projekce.</p>
        </aside>

        <aside className="community-detail-backend"><span>BACKEND_REQUIRED</span><p>Interakce výše jsou pouze místní vývojová data. Produkční komentáře, reakce, moderace a odeslání hlášení vyžadují vzdálený backend.</p></aside>

        {reportOpen && (
          <div className="community-detail-report-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}>
            <form className="community-detail-report-sheet" role="dialog" aria-modal="true" aria-labelledby="community-report-title" onSubmit={submitReport}>
              <button className="community-detail-report-close" type="button" onClick={() => setReportOpen(false)} aria-label="Zavřít hlášení">×</button>
              <span>LOCAL/DEV REPORT</span>
              <h2 id="community-report-title">Nahlásit úlovek</h2>
              <p>Záznam se uloží lokálně. Do produkční moderace se odešle až po připojení backendu.</p>
              <fieldset>
                <legend>Důvod</legend>
                {COMMUNITY_REPORT_REASONS.map((reason) => <label key={reason.id}><input type="radio" name="report-reason" value={reason.id} checked={reportReason === reason.id} onChange={(event) => setReportReason(event.target.value)} />{reason.label}</label>)}
              </fieldset>
              <button className="community-detail-report-submit" type="submit" disabled={!reportReason || reportBusy}>{reportBusy ? "Ukládám…" : "Uložit lokální hlášení"}</button>
            </form>
          </div>
        )}
      </main>
    </Layout>
  );
}

export default CommunityCatchDetailPage;
