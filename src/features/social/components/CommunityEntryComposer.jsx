import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/authContextValue.js";
import { socialRequest } from "../data/socialClient.js";
import { useSocialConnection } from "./useSocialConnection.js";
import { DEFAULT_NEW_ENTRY_VISIBILITY, entryComposerPayload } from "../data/entryComposerModel.js";
import { canShareWithAudience } from "../data/profileSettingsModel.js";

export default function CommunityEntryComposer({ onPublished, initialPost, onOpenChange }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const online = useSocialConnection();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(null);
  const [kind, setKind] = useState(initialPost?.kind ?? "experience");
  const [visibility, setVisibility] = useState(initialPost?.visibility ?? DEFAULT_NEW_ENTRY_VISIBILITY);
  const [title, setTitle] = useState(initialPost?.content.title ?? "");
  const [description, setDescription] = useState(initialPost?.content.description ?? "");
  const [achievementId, setAchievementId] = useState(initialPost?.content.achievement?.id ?? "");
  const [entryId, setEntryId] = useState(() => initialPost?.sourceEntryId ?? crypto.randomUUID());
  const [action, setAction] = useState(null);
  const controllerRef = useRef(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => () => controllerRef.current?.abort(), [uid]);
  useEffect(() => {
    if (!open || !uid || !online) return undefined;
    const controller = new AbortController();
    socialRequest("self", {}, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setOptions(value.profile ? { uid, ...value.entryOptions, publicationConsent: value.publicationConsent } : { uid, error: "Nejdřív ulož svůj rybářský profil." });
    }).catch(error => { if (!controller.signal.aborted) setOptions({ uid, error: error.message }); });
    return () => controller.abort();
  }, [open, uid, online, retry]);
  const current = options?.uid === uid ? options : null;
  const busy = Boolean(uid && action?.uid === uid && action.busy);
  async function submit(event) {
    event.preventDefault();
    if (busy || !online || !uid) return;
    if (!canShareWithAudience(current?.publicationConsent, visibility)) {
      setAction({ uid, error: "Nejdřív zvol a ulož veřejný režim v nastavení rybářského profilu." });
      return;
    }
    const controller = new AbortController(); controllerRef.current = controller;
    setAction({ uid, busy: true });
    try {
      const saved = await socialRequest("entries.save", entryComposerPayload({ entryId, kind, visibility, title, description, achievementId }, initialPost), { signal: controller.signal });
      if (controller.signal.aborted) return;
      setAction({ uid, postId: saved.post.id, message: visibility === "private" ? "Příspěvek je uložený pouze pro tebe. Najdeš ho ve své sdílené galerii na profilu." : "Příspěvek je uložený pro vybraný okruh čtenářů." });
      if (!initialPost) { setDescription(""); setTitle(""); setVisibility("public"); setAchievementId(""); setEntryId(crypto.randomUUID()); }
      onPublished();
    } catch (error) { if (!controller.signal.aborted) setAction({ uid, error: error.message }); }
  }
  if (!uid) return null;
  return <details className="community-entry-composer" onToggle={event => { setOpen(event.currentTarget.open); onOpenChange?.(event.currentTarget.open); }}>
    <summary>{initialPost ? "Upravit příspěvek" : "Napsat příspěvek"}</summary>
    {open && <div className="community-entry-body"><p>Sdílej zážitek, vybraný úspěch nebo potvrzený milník. Viditelnost vždy volíš sám.</p><Link to="/gallery">Sdílet úlovek z galerie →</Link>
      {!online && <p role="status">Odeslání příspěvku vyžaduje připojení.</p>}
      {!current ? <p role="status">Načítám možnosti sdílení…</p> : current.error ? <div role="alert"><p>{current.error}</p><Link to="/profile/social">Nastavit rybářský profil</Link><button type="button" onClick={() => { setOptions(null); setRetry(value => value + 1); }}>Zkusit znovu</button></div> : <form onSubmit={submit}>
        <label>Typ příspěvku<select value={kind} disabled={busy || Boolean(initialPost)} onChange={event => setKind(event.target.value)}><option value="experience">Zážitek od vody</option><option value="achievement">Vybraný úspěch</option><option value="milestone">Potvrzený milník</option></select></label>
        {kind === "experience" && <label>Titulek (nepovinný)<input maxLength={100} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>}
        {kind === "achievement" && <>{current.achievements?.length ? <label>Úspěch z tvého profilu<select required value={achievementId} disabled={busy} onChange={event => setAchievementId(event.target.value)}><option value="">Vyber úspěch</option>{current.achievements.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : <p>Na profilu zatím nemáš vybraný úspěch ke sdílení. <Link to="/profile/social">Upravit profil</Link></p>}<p>Úspěchy jsou nahlášené uživatelem; server jejich splnění neověřil.</p></>}
        {kind === "milestone" && <p>{current.progression ? `Sdílíš potvrzený stav: úroveň ${current.progression.level}, ${current.progression.xp} XP.` : "Zatím nemáš serverem potvrzený milník ke sdílení."}</p>}
        <label>Text příspěvku<textarea maxLength={1000} required value={description} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
        <label>Kdo příspěvek uvidí<select value={visibility} disabled={busy} onChange={event => setVisibility(event.target.value)}><option value="private">Pouze já</option><option value="friends">Přátelé</option><option value="public">Pro všechny</option></select></label>
        {!canShareWithAudience(current.publicationConsent, visibility) && <p role="status">Pro sdílení nejdřív potvrď veřejný režim. <Link to="/profile/social">Nastavit soukromí a sdílení</Link></p>}
        <p>Viditelnost také respektuje nastavení příslušné sekce profilu. Nejvýše 5 uložení za minutu a 20 za den.</p>
        <button type="submit" disabled={busy || !online || !description.trim()
          || !canShareWithAudience(current.publicationConsent, visibility)
          || kind === "achievement" && !achievementId || kind === "milestone" && !current.progression}>{busy ? "Ukládám…" : initialPost ? "Uložit změny" : visibility === "private" ? "Uložit jen pro mě" : "Sdílet příspěvek"}</button>
      </form>}
      {action?.uid === uid && (action.message || action.error) && <div role={action.error ? "alert" : "status"}><p>{action.error || action.message}</p>{action.postId && <Link to={`/community/post/${action.postId}`}>Otevřít příspěvek →</Link>}</div>}
    </div>}
  </details>;
}
