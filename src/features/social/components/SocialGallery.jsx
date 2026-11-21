import { useEffect, useMemo, useRef, useState } from "react";
import CatchMeasurements from "../../catches/components/CatchMeasurements.jsx";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/authContextValue.js";
import { focusPhotoOpener } from "../../../shared/components/photoViewerNavigation.js";
import PhotoViewer, { ViewerImage } from "../../../shared/components/PhotoViewer.jsx";
import { socialRequest } from "../data/socialClient.js";
import "./socialGallery.css";

const visibilityLabels = { public: "Veřejně", friends: "Přátelé", private: "Pouze autor" };
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ");
export function PostImage({ post, refreshKey, previewAudience, full = false }) {
  const { user } = useAuth();
  const [image, setImage] = useState(null), [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  const [retry, setRetry] = useState(0);
  const ref = useRef(null), key = `${user?.uid ?? "anonymous"}:${post.id}:${post.revision}:${refreshKey}:${previewAudience ?? "normal"}`;
  useEffect(() => {
    if (!ref.current || visible || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "150px" });
    observer.observe(ref.current); return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if ((!visible && !full) || !post.hasPhoto) return undefined;
    const controller = new AbortController();
    socialRequest("posts.image", { postId: post.id, ...(previewAudience ? { previewAudience } : {}) }, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setImage({ key, data: value.jpegBase64 });
    }).catch(() => { if (!controller.signal.aborted) setImage({ key, error: true }); });
    return () => controller.abort();
  }, [visible, full, post.id, post.hasPhoto, key, previewAudience, retry]);
  if (full) {
    if (image?.key === key && image.data) return <ViewerImage src={"data:image/jpeg;base64," + image.data} alt={"Sdílený úlovek: " + postTitle(post)} />;
    if (image?.key === key && image.error) return <div className="photo-viewer-status" role="status">
      <p>Fotografie není dostupná.</p><button type="button" className="publication-toggle" onClick={() => { setImage(null); setRetry(value => value + 1); }}>Zkusit znovu</button>
    </div>;
    return <p className="photo-viewer-status" role="status">Načítám fotografii…</p>;
  }
  return <span ref={ref} className="social-post-image">
    {image?.key === key && image.data ? <img src={`data:image/jpeg;base64,${image.data}`} alt={`Sdílený úlovek: ${(post.content.title || post.content.species || "Příspěvek")}`} loading="lazy" />
      : <span className="social-post-loading">{!post.hasPhoto ? "🎣" : image?.key === key && image.error ? "Fotografie není dostupná" : "Načítám fotografii…"}</span>}
  </span>;
}
const postTitle = post => post.content.title || post.content.species || "Příspěvek";

export function PostPhotoViewer({ posts, index, onSelect, onClose, refreshKey, previewAudience, onDelete, deleting }) {
  return <PhotoViewer items={posts} index={index} onSelect={onSelect} onClose={onClose}
    describe={post => ({ title: postTitle(post), description: [post.content.caughtAt, post.content.waterName, visibilityLabels[post.visibility]].filter(Boolean).join(" · "),
      measurements: <CatchMeasurements record={post.content} size="compact" /> })}
    renderImage={post => <PostImage key={post.id + ":" + post.revision} post={post} refreshKey={refreshKey} previewAudience={previewAudience} full />}
    actions={post => <>
      <Link to={"/u/" + encodeURIComponent(post.author.uid)} onClick={onClose}>{post.author.displayName}</Link>
      <Link to={"/community/post/" + encodeURIComponent(post.id)} onClick={onClose}>Detail příspěvku →</Link>
      {onDelete && <button className="publication-toggle" type="button" disabled={deleting} onClick={() => onDelete(post)}>Odstranit příspěvek</button>}
    </>} />;
}

/** All rows and image bytes are permission-filtered by the server, never from private catch URLs. */
export default function SocialGallery({ identity, photosOnly = false, previewAudience }) {
  const { user } = useAuth(), uid = user?.uid;
  const key = `${identity}:${uid ?? "anonymous"}:${previewAudience ?? "normal"}`;
  const [result, setResult] = useState(null), [refresh, setRefresh] = useState(0);
  const [online, setOnline] = useState(globalThis.navigator?.onLine !== false);
  const [query, setQuery] = useState(""), [viewer, setViewer] = useState(null);
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
  const posts = useMemo(() => online ? (current?.posts ?? []).filter(post => (!photosOnly || post.hasPhoto) && normalize(`${(post.content.title || post.content.species || "Příspěvek")} ${post.content.waterName ?? ""}`).includes(normalize(query))) : [], [online, current, photosOnly, query]);
  const photos = posts.filter(post => post.hasPhoto);
  const viewerIndex = viewer?.key === key ? photos.findIndex(post => post.id === viewer.id) : -1;
  const select = post => setViewer({ key, id: post.id });
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
      if (!controller.signal.aborted) { setViewer(null); setAction({ key, message: "Příspěvek byl odstraněn. Soukromý úlovek zůstává v deníku." }); setRefresh(value => value + 1); }
    } catch (error) { if (!controller.signal.aborted) setAction({ key, error: error.message }); }
  }
  return <div className="social-post-gallery">
    <div className="social-gallery-tools"><label>Hledat v načtených příspěvcích<input type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Druh nebo sdílený revír" /></label><button type="button" disabled={!online} onClick={() => { setResult(null); setRefresh(value => value + 1); }}>Obnovit</button></div>
    {!online ? <p className="social-empty" role="status">Sdílená galerie vyžaduje připojení. Soukromý deník zůstává dostupný offline.</p> : !current ? <p role="status" className="social-post-loading">Načítám sdílené příspěvky…</p> : current.error ? <p role="alert" className="social-error">{current.error}</p> : <>
      {posts.length ? <div className="social-post-grid">{posts.map(post => {
        const caption = <span className="social-post-caption"><strong>{postTitle(post)}</strong><CatchMeasurements record={post.content} size="compact" /><small>{visibilityLabels[post.visibility] ?? "Sdíleno"}</small></span>;
        return <article key={post.id + ":" + post.revision} className="social-post-tile">
          {post.hasPhoto ? <button type="button" onClick={event => { focusPhotoOpener(event); select(post); }} aria-label={"Otevřít fotografii: " + postTitle(post)}>
            <PostImage post={post} refreshKey={refresh} previewAudience={previewAudience} />{caption}
          </button> : <Link className="social-post-text-link" to={"/community/post/" + encodeURIComponent(post.id)}>{caption}</Link>}
          {!post.hasPhoto && !previewAudience && uid === post.author.uid && <button type="button" className="social-post-remove" disabled={action?.key === key && action.busy} onClick={() => remove(post)}>Odstranit příspěvek</button>}
        </article>;
      })}</div> : <p className="social-empty">{query ? "Žádné načtené příspěvky neodpovídají hledání." : photosOnly ? "Zatím žádné fotografie sdílené pro tento okruh návštěvníků." : "Zatím žádné příspěvky sdílené pro tento okruh návštěvníků."}</p>}
      {current.nextCursor && <button type="button" className="social-gallery-more" disabled={loadingKey === key} onClick={more}>{loadingKey === key ? "Načítám…" : "Načíst další příspěvky"}</button>}
    </>}
    {action?.key === key && (action.error || action.message) && <p role={action.error ? "alert" : "status"} className={action.error ? "social-error" : "social-success"}>{action.error || action.message}</p>}
    {viewerIndex >= 0 && <PostPhotoViewer posts={photos} index={viewerIndex} onSelect={index => select(photos[index])}
      onClose={() => setViewer(null)} deleting={action?.key === key && action.busy} refreshKey={refresh} previewAudience={previewAudience}
      onDelete={!previewAudience && uid === photos[viewerIndex].author.uid ? remove : undefined} />}
  </div>;
}
