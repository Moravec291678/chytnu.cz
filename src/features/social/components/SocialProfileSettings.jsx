import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../../shared/layout/Layout.jsx";
import { useAuth } from "../../auth/context/authContextValue.js";
import { socialRequest } from "../data/socialClient.js";
import { FishingProfileView } from "./PublicFishingProfile.jsx";
import "./socialProfiles.css";

const sectionLabels = { interests: "Region a rybářské zájmy", statistics: "Statistiky", catches: "Vybrané úlovky", gallery: "Vybrané fotografie", achievements: "Ověřené úspěchy", trophies: "Trofejní vitrína" };
const sectionDefaults = Object.fromEntries(Object.keys(sectionLabels).map(key => [key, "private"]));
function editableProfile(profile) {
  return { handle: profile?.handle ?? "", displayName: profile?.displayName ?? "", bio: profile?.bio ?? "", region: profile?.region ?? "", specialization: profile?.specialization ?? "", favoriteSpecies: profile?.favoriteSpecies ?? "",
    visibility: profile?.visibility ?? "private", discoverable: profile?.discoverable === true,
    sections: { ...sectionDefaults, ...profile?.sections }, sharedCatchIds: profile?.sharedCatchIds ?? [], sharedPhotos: profile?.sharedPhotos ?? [] };
}
function VisibilityOptions() { return <><option value="private">Pouze já</option><option value="friends">Přátelé</option><option value="public">Veřejně</option></>; }
async function avatarJpeg(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10_000_000) throw new Error("Vyber JPEG, PNG nebo WebP do 10 MB.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = source;
    await image.decode();
    const size = Math.min(512, image.naturalWidth, image.naturalHeight);
    if (!size) throw new Error("Fotografii nelze přečíst.");
    const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Úprava fotografie není v tomto prohlížeči dostupná.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, size, size);
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, 0, 0, size, size);
    const encoded = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
    if (!encoded || encoded.length > 270_000) throw new Error("Fotografie je příliš velká. Zkus jednodušší výřez.");
    return encoded;
  } finally { URL.revokeObjectURL(source); }
}

export default function SocialProfileSettings() {
  const auth = useAuth(), uid = auth.user?.uid;
  const [loaded, setLoaded] = useState(null);
  const [form, setForm] = useState(null);
  const [busyUid, setBusyUid] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [preview, setPreview] = useState(null);
  const [revision, setRevision] = useState(0);
  const avatarInput = useRef(null), currentUid = useRef(uid), actionController = useRef(null);
  useEffect(() => { currentUid.current = uid; }, [uid]);
  useEffect(() => () => actionController.current?.abort(), [uid]);
  useEffect(() => {
    if (!uid) return undefined;
    const controller = new AbortController();
    socialRequest("self", {}, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setLoaded({ uid, ...value }); setForm({ uid, value: editableProfile(value.profile) }); }
    }).catch(reason => { if (!controller.signal.aborted) setLoaded({ uid, error: reason.message }); });
    return () => controller.abort();
  }, [uid, revision]);
  const busy = Boolean(uid && busyUid === uid);
  const message = feedback?.uid === uid ? feedback.message : "";
  const error = feedback?.uid === uid ? feedback.error : "";
  const ready = loaded?.uid === uid && !loaded.error && form?.uid === uid;
  const profile = ready ? form.value : null;
  const patch = (name, value) => { setForm(old => ({ uid, value: { ...old.value, [name]: value } })); setFeedback(null); setPreview(null); };
  async function action(task, success) {
    if (busy || !uid) return;
    const controller = new AbortController(); actionController.current = controller;
    const startedUid = uid; setBusyUid(uid); setFeedback(null);
    try { await task(controller.signal); if (currentUid.current === startedUid && !controller.signal.aborted) setFeedback({ uid, message: success }); }
    catch (reason) { if (currentUid.current === startedUid && !controller.signal.aborted) setFeedback({ uid, error: reason.message }); }
    finally { setBusyUid(active => active === startedUid ? null : active); }
  }
  const selectedPhotos = profile?.sharedPhotos ?? [];
  function toggleCatch(id) {
    patch("sharedCatchIds", profile.sharedCatchIds.includes(id) ? profile.sharedCatchIds.filter(value => value !== id) : [...profile.sharedCatchIds, id].slice(0, 12));
  }
  function togglePhoto(catchId, photoId) {
    const exists = selectedPhotos.some(photo => photo.catchId === catchId && photo.photoId === photoId);
    patch("sharedPhotos", exists ? selectedPhotos.filter(photo => photo.catchId !== catchId || photo.photoId !== photoId) : [...selectedPhotos, { catchId, photoId }].slice(0, 6));
  }
  return <Layout><div className="social-page social-settings"><Link to="/profile">← Můj profil</Link><header><p className="social-eyebrow">Rybářská identita</p><h1>Můj rybářský profil</h1><p>Ty rozhoduješ, co uvidí ostatní. Tvůj osobní deník, přesná místa a poznámky zůstávají soukromé.</p></header>
    {!uid && <section className="social-panel"><h2>Propojit profil s účtem</h2><p>Rybářský profil vyžaduje přihlášení. Místní deník tím neztratíš.</p><Link to="/login" className="social-primary">Přihlásit se</Link></section>}
    {uid && loaded?.uid !== uid && <p role="status">Načítám nastavení…</p>}
    {loaded?.uid === uid && loaded.error && <p role="alert" className="social-error">{loaded.error}<button onClick={() => setRevision(value => value + 1)}>Zkusit znovu</button></p>}
    {ready && profile && <>
      <form onSubmit={event => { event.preventDefault(); action(async signal => { const value = await socialRequest("save", { profile }, { signal }); if (currentUid.current === uid && !signal.aborted) { setLoaded(old => ({ ...old, profile: value.profile })); setForm({ uid, value: editableProfile(value.profile) }); setPreview(null); } }, "Profil byl uložen. Změny viditelnosti už platí pro další zobrazení."); }}>
        <fieldset disabled={busy}>
        <section className="social-panel"><h2>Jak tě ostatní poznají</h2><div className="social-field-grid"><label>Zobrazované jméno<input required maxLength={60} value={profile.displayName} onChange={event => patch("displayName", event.target.value)} autoComplete="nickname" /></label><label>Veřejné uživatelské jméno<input required minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]{2,23}" value={profile.handle} onChange={event => patch("handle", event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="social-handle-help" /></label></div><p id="social-handle-help" className="social-help">3–24 znaků: písmena bez diakritiky, číslice a podtržítko. Začni písmenem. Velikost písmen nerozhoduje.</p><label>O mně<textarea maxLength={280} value={profile.bio} onChange={event => patch("bio", event.target.value)} placeholder="Co tě na rybaření baví?" /></label><div className="social-field-grid"><label>Obecný region (dobrovolné)<input maxLength={80} value={profile.region} onChange={event => patch("region", event.target.value)} placeholder="Například jižní Morava" /></label><label>Rybářská specializace<input maxLength={160} value={profile.specialization} onChange={event => patch("specialization", event.target.value)} placeholder="Například přívlač" /></label><label>Oblíbené druhy ryb<input maxLength={160} value={profile.favoriteSpecies} onChange={event => patch("favoriteSpecies", event.target.value)} /></label></div></section>
        <section className="social-panel"><h2>Viditelnost</h2><p className="social-help">Veřejné sekce mohou číst i návštěvníci bez přihlášení. Blokování účtu anonymní přístup neomezuje.</p><label>Celý profil<select value={profile.visibility} onChange={event => patch("visibility", event.target.value)}><VisibilityOptions /></select></label><label className="social-check"><input type="checkbox" checked={profile.discoverable} onChange={event => patch("discoverable", event.target.checked)} /><span>Povolit vyhledání podle uživatelského jména</span></label><p className="social-help">Vypnutí vyhledávání neruší účet. Přímý odkaz se nadále řídí viditelností profilu.</p><div className="social-field-grid">{Object.entries(sectionLabels).map(([key, label]) => <label key={key}>{label}<select value={profile.sections[key]} onChange={event => patch("sections", { ...profile.sections, [key]: event.target.value })}><VisibilityOptions /></select></label>)}</div><p className="social-help">Sekce nikdy nezpřístupní celý profil širšímu okruhu, než dovoluje nastavení nahoře.</p></section>
        <section className="social-panel"><h2>Výslovně vybrané úlovky a fotografie</h2><p className="social-help">Statistiky a trofeje vycházejí jen z vybraných záznamů. Přesné místo ani soukromé poznámky se nesdílí. Nejvýše 12 úlovků a 6 fotografií.</p>{loaded.candidateCatches?.length ? <div className="social-share-choices">{loaded.candidateCatches.map(record => <div key={record.id}><label className="social-check"><input type="checkbox" checked={profile.sharedCatchIds.includes(record.id)} disabled={!profile.sharedCatchIds.includes(record.id) && profile.sharedCatchIds.length >= 12} onChange={() => toggleCatch(record.id)} /><span>{record.species || "Úlovek"}{record.lengthCm > 0 ? ` · ${record.lengthCm} cm` : ""}{record.caughtAt && Number.isFinite(Date.parse(record.caughtAt)) ? ` · ${new Date(record.caughtAt).toLocaleDateString("cs-CZ")}` : ""}</span></label>{record.photos?.map((photo, index) => { const checked = selectedPhotos.some(item => item.catchId === record.id && item.photoId === photo.photoId); return <label className="social-check social-photo-choice" key={photo.photoId}><input type="checkbox" checked={checked} disabled={!checked && selectedPhotos.length >= 6} onChange={() => togglePhoto(record.id, photo.photoId)} /><span>Sdílet fotografii {index + 1}</span></label>; })}</div>)}</div> : <p className="social-empty">Zatím nejsou dostupné synchronizované úlovky k výběru. Profil můžeš uložit i bez nich.</p>}</section>
        <button className="social-primary" disabled={busy}>{busy ? "Pracuji…" : "Uložit rybářský profil"}</button>
        </fieldset>
      </form>
      <section className="social-panel"><h2>Profilová fotografie</h2><p className="social-help">Vybraná fotografie se ořízne na čtverec. Sdílí se jako součást viditelného profilu.</p><input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" className="social-file" aria-label="Vybrat profilovou fotografii" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) action(async signal => { await socialRequest("avatar.set", { jpegBase64: await avatarJpeg(file) }, { signal }); }, "Profilová fotografie byla změněna."); }} /><div className="social-button-row"><button type="button" disabled={busy || !loaded.profile} onClick={() => avatarInput.current?.click()}>Nahrát fotografii</button><button type="button" disabled={busy || !loaded.profile} onClick={() => action(signal => socialRequest("avatar.remove", {}, { signal }), "Profilová fotografie byla odstraněna.")}>Odstranit fotografii</button></div>{!loaded.profile && <p className="social-help">Nejdřív profil ulož.</p>}</section>
      <section className="social-panel"><h2>Zkontrolovat viditelnost</h2><p className="social-help">Náhled načte poslední uloženou verzi ze serveru.</p><div className="social-button-row">{[["stranger", "Pohled cizího rybáře"], ["friend", "Pohled přítele"]].map(([audience, label]) => <button key={audience} type="button" disabled={busy || !loaded.profile} onClick={() => action(async signal => { const value = await socialRequest("preview", { audience }, { signal }); if (!signal.aborted && currentUid.current === uid) setPreview({ uid, audience, profile: value.profile }); }, "Náhled byl načten.")}>{label}</button>)}{loaded.profile && <Link to={`/u/${uid}`} className="social-primary">Otevřít profil</Link>}</div></section>
      {loaded.blockedAccounts?.length > 0 && <section className="social-panel"><h2>Blokované účty</h2><p className="social-help">Po zrušení blokování se dřívější přátelství automaticky neobnoví.</p><ul className="social-blocked-list">{loaded.blockedAccounts.map(account => <li key={account.uid}><span>Účet {account.uid}</span><button type="button" disabled={busy} onClick={() => action(async signal => { await socialRequest("block", { targetUid: account.uid, blocked: false }, { signal }); if (!signal.aborted && currentUid.current === uid) setLoaded(old => ({ ...old, blockedAccounts: old.blockedAccounts.filter(item => item.uid !== account.uid) })); }, "Blokování bylo zrušeno.")}>Zrušit blokování</button></li>)}</ul></section>}
      {preview?.uid === uid && <section className="social-preview" aria-label="Serverový náhled profilu"><h2>{preview.audience === "friend" ? "Pohled přítele" : "Pohled cizího rybáře"}</h2>{preview.profile ? <FishingProfileView key={preview.audience} profile={preview.profile} preview /> : <p className="social-panel">Pro tento okruh je profil skrytý.</p>}</section>}
    </>}
    {message && <p className="social-success" role="status">{message}</p>}{error && <p className="social-error" role="alert">{error}</p>}
  </div></Layout>;
}
