import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../../../shared/layout/Layout.jsx";
import { useAuth } from "../../auth/context/authContextValue.js";
import CollaboratorBadge from "../../admin/CollaboratorBadge.jsx";
import { socialRequest } from "../data/socialClient.js";
import ProfileFriendship from "./ProfileFriendship.jsx";
import SocialGallery from "./SocialGallery.jsx";
import { PublicAchievements, PublicStatistics, PublicTrophies } from "./PublicProgression.jsx";
import { FEATURES } from "../../../product/config/featureFlags.js";
import "./socialProfiles.css";

export function SharedImage({ profile, photo, avatar = false }) {
  const key = `${profile.uid}:${profile.avatarVersion ?? ""}:${avatar ? "avatar" : `${photo.catchId}:${photo.photoId}`}`;
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    socialRequest("image", { identity: profile.uid, kind: avatar ? "avatar" : "catch", ...(!avatar ? photo : {}) }, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setLoaded({ key, data: value.jpegBase64 }); })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ key, data: null }); });
    return () => controller.abort();
  }, [key, profile.uid, avatar, photo]);
  return loaded?.key === key && loaded.data
    ? <img src={`data:image/jpeg;base64,${loaded.data}`} alt={avatar ? `Avatar rybáře ${profile.displayName}` : "Výslovně sdílená fotografie úlovku"} />
    : <span className="social-image-placeholder" aria-label={avatar ? "Profilová fotografie" : "Fotografie není dostupná"}>{avatar ? profile.displayName?.charAt(0) || "🎣" : "▧"}</span>;
}

export function FishingProfileView({ profile, preview = false, previewAudience }) {
  const [tab, setTab] = useState("catches");
  const catches = profile.catches ?? [];
  const photos = profile.photos ?? [];
  const stats = profile.statistics;
  const interests = [profile.region, profile.specialization, profile.favoriteSpecies].filter(Boolean);
  return <>
    <header className="social-profile-header">
      <div className="social-avatar">{profile.avatarVersion ? <SharedImage profile={profile} avatar /> : <span>{profile.displayName?.charAt(0) || "🎣"}</span>}</div>
      <div className="social-identity"><p className="social-eyebrow">Rybářský profil{preview ? " · náhled" : ""}</p><h1>{profile.displayName}</h1><p className="social-handle">@{profile.handle}</p>
        <CollaboratorBadge access={profile.badgeRole ? { role: profile.badgeRole } : null} />
      </div>
      {profile.bio && <p className="social-bio">{profile.bio}</p>}
      {interests.length > 0 && <div className="social-interests">{interests.map((value, index) => <span key={`${index}:${value}`}>{value}</span>)}</div>}
      {profile.progression?.level != null && <p className="social-level" title="Úroveň z událostí potvrzených serverem; může se lišit od místního deníku.">Úroveň {profile.progression.level}{profile.progression.rank ? ` · ${profile.progression.rank}` : ""}<small> · potvrzené události</small></p>}
    </header>
    <PublicStatistics statistics={stats} />
    <nav className="social-tabs" aria-label="Obsah rybářského profilu">{[["catches", "Úlovky"], ["gallery", "Fotografie"], ["achievements", "Úspěchy"], ["trophies", "Trofeje"]].map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <section className="social-panel" aria-live="polite">
      {tab === "catches" && <><h2>Sdílené úlovky</h2>{catches.length ? <div className="social-catch-list">{catches.map(catchRecord => <article key={catchRecord.id}><span aria-hidden="true">🎣</span><div><h3>{catchRecord.species || "Úlovek"}</h3><p>{catchRecord.lengthCm > 0 ? `${catchRecord.lengthCm} cm · ` : ""}{catchRecord.caughtAt && Number.isFinite(Date.parse(catchRecord.caughtAt)) ? new Date(catchRecord.caughtAt).toLocaleDateString("cs-CZ") : ""}</p></div></article>)}</div> : !FEATURES.publicSharing ? <p className="social-empty">Tento rybář zatím nesdílí žádné úlovky pro tento okruh návštěvníků.</p> : null}</>}
      {tab === "gallery" && <><h2>Fotografie od vody</h2>{FEATURES.publicSharing && <SocialGallery identity={profile.uid} photosOnly previewAudience={previewAudience} />}{photos.length ? <><h3>Výběr na profilu</h3><div className="social-gallery">{photos.map(photo => <figure key={`${photo.catchId}:${photo.photoId}`}><SharedImage profile={profile} photo={photo} /></figure>)}</div></> : !FEATURES.publicSharing ? <p className="social-empty">Žádné zveřejněné fotografie. Soukromá galerie zůstává v osobním deníku.</p> : null}</>}
      {tab === "catches" && FEATURES.publicSharing && <SocialGallery identity={profile.uid} previewAudience={previewAudience} />}
      {tab === "achievements" && <PublicAchievements achievements={profile.achievements} progression={profile.progression} />}
      {tab === "trophies" && <PublicTrophies trophies={profile.trophies} />}
    </section>
  </>;
}

export default function PublicFishingProfile() {
  const { identity } = useParams();
  const auth = useAuth();
  const uid = auth.user?.uid;
  const key = `${identity}:${uid ?? "anonymous"}`;
  const [result, setResult] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState({ busy: false, message: "", error: "" });
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const actionController = useRef(null);
  useEffect(() => () => actionController.current?.abort(), [key]);
  useEffect(() => {
    const controller = new AbortController();
    socialRequest("view", { identity }, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult({ key, profile: value.profile });
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }); });
    return () => controller.abort();
  }, [identity, key, refresh]);
  useEffect(() => {
    const onFocus = () => setRefresh(value => value + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const current = result?.key === key ? result : null;
  const profile = current?.profile;
  const busy = action.key === key && action.busy;
  const friendshipTarget = profile?.uid ?? (/^[A-Za-z0-9_-]{1,128}$/.test(identity ?? "") ? identity : null);
  async function perform(name, payload) {
    if (busy) return;
    const controller = new AbortController(); actionController.current = controller;
    setAction({ key, busy: true, message: "", error: "" });
    try {
      await socialRequest(name, payload, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setAction({ key, busy: false, blockedTargetUid: name === "block" && payload.blocked ? payload.targetUid : null,
        message: name === "block" ? payload.blocked ? "Účet byl zablokován. Jeho profil se ti nezobrazuje." : "Blokování bylo zrušeno." : "Hlášení bylo odesláno k posouzení.", error: "" });
      setReportOpen(false); if (name === "block" && payload.blocked) setResult({ key, profile: null });
      if (name === "block" && !payload.blocked) setRefresh(value => value + 1);
    } catch (error) { setAction({ key, busy: false, message: "", error: controller.signal.aborted ? "" : error.message }); }
  }
  return <Layout><div className="social-page"><div className="social-topline"><Link to="/profile">← Můj profil</Link><button type="button" onClick={() => setRefresh(value => value + 1)}>Obnovit</button></div>
    {!current && <p role="status" className="social-panel">Načítám rybářský profil…</p>}
    {current?.error && <p role="alert" className="social-error">{current.error}</p>}
    {current && !current.error && !profile && <section className="social-panel"><h1>Profil není dostupný</h1><p className="social-empty">Rybář ho nezveřejnil, omezil viditelnost nebo není pro tento účet dostupný.</p></section>}
    {uid && friendshipTarget && uid !== friendshipTarget && <ProfileFriendship viewerUid={uid} targetUid={friendshipTarget} profileAvailable={Boolean(profile)} refreshKey={refresh} onChanged={() => setRefresh(value => value + 1)} />}
    {profile && <><FishingProfileView key={key} profile={profile} />
      {uid === profile.uid && <Link className="social-primary" to="/profile/social">Upravit rybářský profil</Link>}
      {uid && uid !== profile.uid && <section className="social-actions" aria-label="Bezpečnost profilu"><details><summary>Nahlásit nebo blokovat</summary><p>Blokování přeruší sociální propojení s tímto účtem.</p><button disabled={busy} onClick={() => perform("block", { targetUid: profile.uid, blocked: true })}>Zablokovat účet</button><button disabled={busy} onClick={() => { setReportOpen(reportOpen === key ? null : key); setReason(""); }}>Nahlásit profil</button></details>
        {reportOpen === key && <form onSubmit={event => { event.preventDefault(); perform("report", { targetUid: profile.uid, reason: reason.trim() }); }}><label>Důvod hlášení<textarea required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><button className="social-primary" disabled={busy || reason.trim().length < 5}>Odeslat hlášení</button></form>}
      </section>}
    </>}
    {action.key === key && action.message && <p role="status" className="social-success">{action.message}</p>}{action.key === key && action.error && <p role="alert" className="social-error">{action.error}</p>}
    {action.key === key && action.blockedTargetUid && <button disabled={busy} onClick={() => perform("block", { targetUid: action.blockedTargetUid, blocked: false })}>Zrušit blokování</button>}
  </div></Layout>;
}
