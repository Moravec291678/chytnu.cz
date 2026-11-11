import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/authContextValue.js";
import { useModalFocusTrap } from "../../../shared/hooks/useModalFocusTrap.js";
import { socialRequest } from "../data/socialClient.js";
import "./socialGallery.css";
import "../../../pages/GalleryPage.css";

const visibilityLabels = { public: "Veřejně", friends: "Přátelé", private: "Pouze autor" };
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ");
function PostImage({ post, refreshKey, previewAudience }) {
  const { user } = useAuth();
  const [image, setImage] = useState(null), [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  const ref = useRef(null), key = `${user?.uid ?? "anonymous"}:${post.id}:${post.revision}:${refreshKey}:${previewAudience ?? "normal"}`;
  useEffect(() => {
    if (!ref.current || visible || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "150px" });
    observer.observe(ref.current); return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || !post.hasPhoto) return undefined;
    const controller = new AbortController();
    socialRequest("posts.image", { postId: post.id, ...(previewAudience ? { previewAudience } : {}) }, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setImage({ key, data: value.jpegBase64 });
    }).catch(() => { if (!controller.signal.aborted) setImage({ key, error: true }); });
    return () => controller.abort();
  }, [visible, post.id, post.hasPhoto, key, previewAudience]);
  return <span ref={ref} className="social-post-image">
    {image?.key === key && image.data ? <img src={`data:image/jpeg;base64,${image.data}`} alt={`Sdílený úlovek: ${post.content.species}`} loading="lazy" />
      : <span className="social-post-loading">{!post.hasPhoto ? "🎣" : image?.key === key && image.error ? "Fotografie není dostupná" : "Načítám fotografii…"}</span>}
  </span>;
}
function PostDetails({ post }) {
  const content = post.content;
  return <div className="social-post-details"><p><strong>{content.species}</strong>{content.lengthCm > 0 ? ` · ${content.lengthCm} cm` : ""}{content.weightKg > 0 ? ` · ${content.weightKg} kg` : ""}</p>
    {content.caughtAt && <p>Datum: {content.caughtAt}</p>}{content.method && <p>Způsob lovu: {content.method}</p>}{content.waterName && <p>Revír: {content.waterName}</p>}{content.description && <p>{content.description}</p>}
    <p className="social-post-visibility">{visibilityLabels[post.visibility] ?? "Sdíleno"}</p>
  </div>;
}
function PostViewer({ post, onClose, onMove, canMove, onDelete, deleting, refreshKey, previewAudience }) {
  const dialogRef = useRef(null), closeRef = useRef(null);
  useModalFocusTrap(dialogRef, { initialFocusRef: closeRef, onEscape: onClose });
  useEffect(() => {
    const keys = event => { if (event.key === "ArrowRight") onMove(1); if (event.key === "ArrowLeft") onMove(-1); };
    document.addEventListener("keydown", keys); return () => document.removeEventListener("keydown", keys);
  }, [onMove]);
  return <div className="gallery-viewer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className="gallery-viewer social-post-viewer" role="dialog" aria-modal="true" aria-label="Sdílený úlovek">
      <header className="gallery-viewer-header"><strong>{post.content.species}</strong><button ref={closeRef} type="button" onClick={onClose}>Zavřít</button></header>
      {post.hasPhoto && <PostImage post={post} refreshKey={refreshKey} previewAudience={previewAudience} />}
      <PostDetails post={post} />
      <footer className="gallery-viewer-footer"><button type="button" disabled={!canMove} onClick={() => onMove(-1)} aria-label="Předchozí příspěvek">←</button><Link to={`/u/${post.author.uid}`} onClick={onClose}>{post.author.displayName}</Link><button type="button" disabled={!canMove} onClick={() => onMove(1)} aria-label="Další příspěvek">→</button>
        {onDelete && <button type="button" disabled={deleting} onClick={() => onDelete(post)}>Odstranit sdílený příspěvek</button>}
      </footer>
    </section>
  </div>;
}

/** All rows and image bytes are permission-filtered by the server, never from private catch URLs. */
export default function SocialGallery({ identity, photosOnly = false, previewAudience }) {
  const { user } = useAuth(), uid = user?.uid;
  const key = `${identity}:${uid ?? "anonymous"}:${previewAudience ?? "normal"}`;
  const [result, setResult] = useState(null), [refresh, setRefresh] = useState(0);
  const [online, setOnline] = useState(globalThis.navigator?.onLine !== false);
  const [query, setQuery] = useState(""), [viewerId, setViewerId] = useState(null);
  const [loadingKey, setLoadingKey] = useState(null), [action, setAction] = useState(null);
  const actionRef = useRef(null), loadRef = useRef(null);
  useEffect(() => () => { actionRef.current?.abort(); loadRef.current?.abort(); }, [key]);
  useEffect(() => {
    const reconnect = () => { setOnline(navigator.onLine !== false); setRefresh(value => value + 1); };
    const focus = () => { if (document.visibilityState !== "hidden") setRefresh(value => value + 1); };
    window.addEventListener("online", reconnect); window.addEventListener("offline", reconnect); window.addEventListener("focus", focus);
    const timer = setInterval(focus, 45_000);
    return () => { clearInterval(timer); window.removeEventListener("online", reconnect); window.removeEventListener("offline", reconnect); window.removeEventListener("focus", focus); };
  }, []);
  useEffect(() => {
    if (!online) return undefined;
    loadRef.current?.abort();
    const controller = new AbortController();
    socialRequest("posts.list", { identity, ...(previewAudience ? { previewAudience } : {}) }, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult({ key, posts: value.posts, nextCursor: value.nextCursor });
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }); });
    return () => controller.abort();
  }, [identity, key, online, refresh, previewAudience]);
  const current = result?.key === key ? result : null;
  const posts = useMemo(() => online ? (current?.posts ?? []).filter(post => (!photosOnly || post.hasPhoto) && normalize(`${post.content.species} ${post.content.waterName ?? ""}`).includes(normalize(query))) : [], [online, current, photosOnly, query]);
  const viewerIndex = posts.findIndex(post => post.id === viewerId);
  const move = useCallback(direction => {
    setViewerId(old => { const index = posts.findIndex(post => post.id === old); return posts.length ? posts[(Math.max(0, index) + direction + posts.length) % posts.length].id : null; });
  }, [posts]);
  async function more() {
    if (!current?.nextCursor || loadingKey === key || !online) return;
    const controller = new AbortController(); loadRef.current = controller; setLoadingKey(key);
    try {
      const value = await socialRequest("posts.list", { identity, cursor: current.nextCursor, ...(previewAudience ? { previewAudience } : {}) }, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(old => old?.key === key ? { key, posts: [...new Map([...old.posts, ...value.posts].map(post => [post.id, post])).values()], nextCursor: value.nextCursor } : old);
    } catch (error) { if (!controller.signal.aborted) setAction({ key, error: error.message }); }
    finally { setLoadingKey(old => old === key ? null : old); }
  }
  async function remove(post) {
    if (action?.key === key && action.busy) return;
    const controller = new AbortController(); actionRef.current = controller; setAction({ key, busy: true });
    try {
      await socialRequest("posts.delete", { postId: post.id, expectedRevision: post.revision }, { signal: controller.signal });
      if (!controller.signal.aborted) { setViewerId(null); setAction({ key, message: "Příspěvek byl odstraněn. Soukromý úlovek zůstává v deníku." }); setRefresh(value => value + 1); }
    } catch (error) { if (!controller.signal.aborted) setAction({ key, error: error.message }); }
  }
  return <div className="social-post-gallery">
    <div className="social-gallery-tools"><label>Hledat v načtených příspěvcích<input type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Druh nebo sdílený revír" /></label><button type="button" disabled={!online} onClick={() => { setResult(null); setRefresh(value => value + 1); }}>Obnovit</button></div>
    {!online ? <p className="social-empty" role="status">Sdílená galerie vyžaduje připojení. Soukromý deník zůstává dostupný offline.</p> : !current ? <p role="status" className="social-post-loading">Načítám sdílené příspěvky…</p> : current.error ? <p role="alert" className="social-error">{current.error}</p> : <>
      {posts.length ? <div className="social-post-grid">{posts.map(post => <article key={`${post.id}:${post.revision}`} className="social-post-tile"><button type="button" onClick={() => setViewerId(post.id)} aria-label={`Otevřít sdílený úlovek: ${post.content.species}`}><PostImage post={post} refreshKey={refresh} previewAudience={previewAudience} /><span className="social-post-caption"><strong>{post.content.species}</strong><small>{post.content.lengthCm > 0 ? `${post.content.lengthCm} cm · ` : ""}{visibilityLabels[post.visibility] ?? "Sdíleno"}</small></span></button></article>)}</div> : <p className="social-empty">{query ? "Žádné načtené příspěvky neodpovídají hledání." : photosOnly ? "Zatím žádné fotografie sdílené pro tento okruh návštěvníků." : "Zatím žádné příspěvky sdílené pro tento okruh návštěvníků."}</p>}
      {current.nextCursor && <button type="button" className="social-gallery-more" disabled={loadingKey === key} onClick={more}>{loadingKey === key ? "Načítám…" : "Načíst další příspěvky"}</button>}
    </>}
    {action?.key === key && (action.error || action.message) && <p role={action.error ? "alert" : "status"} className={action.error ? "social-error" : "social-success"}>{action.error || action.message}</p>}
    {viewerIndex >= 0 && <PostViewer post={posts[viewerIndex]} onClose={() => setViewerId(null)} onMove={move} canMove={posts.length > 1} deleting={action?.key === key && action.busy} refreshKey={refresh} previewAudience={previewAudience} onDelete={!previewAudience && uid === posts[viewerIndex].author.uid ? remove : undefined} />}
  </div>;
}
