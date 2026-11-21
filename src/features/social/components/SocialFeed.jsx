import { Link } from "react-router-dom";
import CatchMeasurements from "../../catches/components/CatchMeasurements.jsx";
import { useState } from "react";
import { focusPhotoOpener } from "../../../shared/components/photoViewerNavigation.js";
import CollaboratorBadge from "../../admin/CollaboratorBadge.jsx";
import { SharedImage } from "./SharedImage.jsx";
import SocialEntryDetails from "./SocialEntryDetails.jsx";
import SocialInteractions from "./SocialInteractions.jsx";
import { PostImage, PostPhotoViewer } from "./SocialGallery.jsx";
import { useSocialFeed } from "./useSocialFeed.js";
import "./socialFeed.css";

const visibilityLabels = { public: "Veřejně", friends: "Pro přátele", private: "Pouze autor" };
function displayPostDate(value) {
  if (value === null || value === undefined || value === "") return null;
  // A shared coarse date must never become a fabricated precise date.
  if (/^\d{4}(-\d{2})?$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("cs-CZ") : null;
}

export function SocialPostCard({ post, refreshKey, compact = false, detail = false, reportOpen = false, onDraftChange, onOpenPhoto }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const { content, author } = post;
  const title = content.title || content.species || "Příspěvek";
  const caughtDate = displayPostDate(content.caughtAt);
  const date = caughtDate || displayPostDate(post.createdAt);
  const publicationDate = new Date(post.createdAt);
  const dateTime = caughtDate ? content.caughtAt : Number.isFinite(publicationDate.getTime()) ? publicationDate.toISOString() : undefined;
  const path = `/community/post/${encodeURIComponent(post.id)}`;
  return <article className={`online-post${compact ? " online-post--compact" : ""}`}>
    <header className="online-post-author"><Link to={`/u/${encodeURIComponent(author.uid)}`}><span className="online-post-avatar" aria-hidden="true">{author.avatarVersion ? <SharedImage profile={author} avatar /> : author.displayName?.charAt(0) || "🎣"}</span><span><strong>{author.displayName}</strong>{author.handle && <small>@{author.handle}</small>}</span></Link><CollaboratorBadge access={author.badgeRole ? { role: author.badgeRole } : null} /></header>
    {!compact && post.hasPhoto && <button type="button" className="online-post-photo photo-open-button"
      aria-label={`Otevřít fotografii: ${title}`} onClick={event => {
        focusPhotoOpener(event);
        if (onOpenPhoto) onOpenPhoto(post);
        else setPhotoOpen(true);
      }}><PostImage post={post} refreshKey={refreshKey} /></button>}
    <div className="online-post-content">
      {detail ? <h1>{title}</h1> : <h3><Link to={path}>{title}</Link></h3>}
      <SocialEntryDetails post={post} />
      <div className="online-post-meta"><CatchMeasurements record={content} size="compact" />{date && <time dateTime={dateTime}>{caughtDate ? date : `Sdíleno ${date}`}</time>}<span>{visibilityLabels[post.visibility] ?? "Sdíleno"}</span></div>
      {!compact && <>{content.description && <p className="online-post-description">{content.description}</p>}{(content.method || content.waterName) && <p className="online-post-context">{[content.method, content.waterName].filter(Boolean).join(" · ")}</p>}</>}
      {!detail && !compact && <Link className="online-post-detail" to={path}>Detail příspěvku <span aria-hidden="true">→</span></Link>}
    </div>
    {detail && <SocialInteractions post={post} reportOpen={reportOpen} onDraftChange={onDraftChange} />}
    {detail && <footer className="online-post-footer"><Link to={`/u/${encodeURIComponent(author.uid)}`}>Profil a sdílená galerie rybáře →</Link></footer>}
    {photoOpen && post.hasPhoto && <PostPhotoViewer posts={[post]} index={0} onClose={() => setPhotoOpen(false)} refreshKey={refreshKey} />}
  </article>;
}

export function SocialFeedState({ feed, mode, children }) {
  if (!feed.online) return <p className="online-feed-state" role="status">Komunita vyžaduje připojení. Tvůj soukromý deník zůstává dostupný offline.</p>;
  if (feed.needsAuth) return <p className="online-feed-state">Pro {mode === "friends" ? "příspěvky přátel" : "komunitní přehled"} se <Link to="/profile">přihlas ke svému účtu</Link>. Místní náhledy jsou dostupné i bez přihlášení.</p>;
  if (!feed.current) return <p className="online-feed-state" role="status">Načítám příspěvky…</p>;
  if (feed.current.error) return <div className="online-feed-state" role="alert"><p>{feed.current.error}</p><button type="button" onClick={feed.reload}>Zkusit znovu</button></div>;
  if (!feed.current.posts?.length) return <><div className="online-feed-state"><p>{feed.current.nextCursor ? "V této části přehledu nejsou dostupné příspěvky. Pokračuj na další část." : mode === "friends" ? "Přátelé zatím nesdílejí žádné dostupné příspěvky." : "Zatím žádné dostupné příspěvky."}</p>{mode === "friends" && !feed.current.nextCursor && <Link to="/friends">Přátelé a pozvání →</Link>}</div>{feed.current.nextCursor ? children : null}</>;
  return children;
}

export default function SocialFeed({ mode = "global", compact = false, catalogueId }) {
  const feed = useSocialFeed({ mode, limit: compact ? 3 : 10, catalogueId, autoRefresh: !catalogueId });
  const [photoId, setPhotoId] = useState(null);
  const photos = feed.online ? (feed.current?.posts ?? []).filter(post => post.hasPhoto) : [];
  const photoIndex = photos.findIndex(post => post.id === photoId);
  const title = catalogueId ? "Sdílené úlovky z revíru" : mode === "friends" || compact ? "Od přátel" : "Pro všechny";
  return <section className={`online-feed${compact ? " online-feed--compact" : ""}`} aria-label={catalogueId ? title : mode === "friends" ? "Příspěvky přátel" : "Veřejné příspěvky"}>
    <header className="online-feed-heading"><h2>{title}</h2>{compact ? <Link to="/community?feed=friends">Vše →</Link> : <button type="button" onClick={feed.reload} disabled={!feed.online || feed.needsAuth}>Obnovit</button>}</header>
    <SocialFeedState feed={feed} mode={mode}><div className="online-feed-list">{feed.current?.posts?.map(post => <SocialPostCard key={`${post.id}:${post.revision}`} post={post} refreshKey={feed.refreshKey} compact={compact} onOpenPhoto={item => setPhotoId(item.id)} />)}</div>
      {!compact && feed.current?.nextCursor && <button className="online-feed-more" type="button" disabled={feed.loadingMore} onClick={feed.more}>{feed.loadingMore ? "Načítám…" : "Načíst další příspěvky"}</button>}
      {feed.current?.moreError && <p role="alert" className="online-feed-state">{feed.current.moreError}</p>}
    </SocialFeedState>
    {photoIndex >= 0 && <PostPhotoViewer posts={photos} index={photoIndex} onSelect={index => setPhotoId(photos[index].id)}
      onClose={() => setPhotoId(null)} refreshKey={feed.refreshKey} />}
  </section>;
}
