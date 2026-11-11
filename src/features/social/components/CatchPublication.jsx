import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/authContextValue.js";
import { socialRequest } from "../data/socialClient.js";
import "./socialGallery.css";
import "./socialProfiles.css";

const initialFields = { length: false, weight: false, date: "none", method: false, water: false };
const visibilityLabels = { private: "Pouze já", friends: "Přátelé", public: "Veřejně" };

/** Explicit approval creates a snapshot; opening the private gallery never publishes anything. */
export default function CatchPublication({ record, photoId, onChanged }) {
  const { user } = useAuth(), uid = user?.uid;
  const key = `${uid ?? "guest"}:${record.id}:${photoId ?? ""}`;
  const [loaded, setLoaded] = useState(null), [form, setForm] = useState(null);
  const [feedback, setFeedback] = useState(null), [busyKey, setBusyKey] = useState(null);
  const [reload, setReload] = useState(0);
  const actionRef = useRef(null);
  useEffect(() => () => actionRef.current?.abort(), [key]);
  useEffect(() => {
    if (!uid) return undefined;
    const controller = new AbortController();
    socialRequest("posts.own", { catchId: record.id }, { signal: controller.signal }).then(({ post }) => {
      if (controller.signal.aborted) return;
      setLoaded({ key, post });
      setForm({ key, visibility: post?.deleted ? "private" : post?.visibility ?? "private", description: post?.deleted ? "" : post?.content.description ?? "", fields: { ...initialFields, ...(!post?.deleted ? post?.fields : {}) } });
    }).catch(error => { if (!controller.signal.aborted) setLoaded({ key, error: error.message }); });
    return () => controller.abort();
  }, [uid, key, record.id, reload]);
  const ready = loaded?.key === key && !loaded.error && form?.key === key;
  const busy = busyKey === key;
  const post = loaded?.key === key ? loaded.post : null;
  const patch = (field, value) => { setForm(old => ({ ...old, [field]: value })); setFeedback(null); };
  async function perform(remove = false) {
    if (!ready || busy) return;
    const controller = new AbortController(); actionRef.current = controller;
    setBusyKey(key); setFeedback(null);
    try {
      if (remove) await socialRequest("posts.delete", { postId: post.id, expectedRevision: post.revision }, { signal: controller.signal });
      else await socialRequest("posts.save", { catchId: record.id, photoId: photoId ?? null,
        visibility: form.visibility, description: form.description, fields: form.fields,
        expectedRevision: post?.revision ?? 0 }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setFeedback({ key, message: remove ? "Sdílený příspěvek byl odstraněn. Soukromý úlovek i fotografie zůstávají v deníku." : "Schválené údaje byly uloženy. Viditelnost platí pro další zobrazení." });
      setReload(value => value + 1); onChanged?.();
    } catch (error) { if (!controller.signal.aborted) setFeedback({ key, error: error.message }); }
    finally { setBusyKey(old => old === key ? null : old); }
  }
  return <section className="catch-publication" aria-label="Sdílení úlovku">
    <h3>Sdílet vybraný úlovek</h3>
    <p className="social-help">Zveřejní se jen schválená kopie údajů a upravená fotografie bez metadat. Hmotnost se sdílí pouze měřená. Soukromé poznámky ani GPS se nesdílí. Co už někdo viděl, může mít uložené.</p>
    <p className="social-help">Příspěvek dále omezuje viditelnost celého profilu a jeho sekce {photoId ? "Vybrané fotografie" : "Vybrané úlovky"}. <Link to="/profile/social">Zkontrolovat nastavení profilu</Link>.</p>
    {!uid ? <p><Link to="/login">Přihlásit se pro sdílení</Link></p> : <>
      {loaded?.key !== key && <p role="status">Načítám stav sdílení…</p>}
      {loaded?.key === key && loaded.error && <p role="alert">{loaded.error} <button onClick={() => setReload(value => value + 1)}>Zkusit znovu</button></p>}
      {ready && <form onSubmit={event => { event.preventDefault(); perform(); }}>
        <fieldset disabled={busy}>
          <p><strong>{record.species || "Úlovek"}</strong>{photoId ? " · vybraná fotografie" : " · bez fotografie"}</p>
          <label>Komu příspěvek ukázat<select value={form.visibility} onChange={event => patch("visibility", event.target.value)}>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="publication-options">
            <label><input type="checkbox" checked={form.fields.length} onChange={event => patch("fields", { ...form.fields, length: event.target.checked })} /> Délka{record.lengthCm > 0 ? `: ${record.lengthCm} cm` : " (je-li vyplněna)"}</label>
            <label><input type="checkbox" checked={form.fields.weight} onChange={event => patch("fields", { ...form.fields, weight: event.target.checked })} /> Hmotnost{record.weightKg > 0 ? `: ${record.weightKg} kg` : " (je-li vyplněna)"}</label>
            <label><input type="checkbox" checked={form.fields.method} onChange={event => patch("fields", { ...form.fields, method: event.target.checked })} /> Způsob lovu (je-li vyplněn)</label>
            <label><input type="checkbox" checked={form.fields.water} onChange={event => patch("fields", { ...form.fields, water: event.target.checked })} /> Oficiální název revíru ČRS (je-li propojen)</label>
          </div>
          <label>Datum<select value={form.fields.date} onChange={event => patch("fields", { ...form.fields, date: event.target.value })}><option value="none">Nesdílet</option><option value="month">Pouze měsíc a rok</option><option value="day">Den bez času</option></select></label>
          <label>Veřejný popis<textarea maxLength={1000} value={form.description} onChange={event => patch("description", event.target.value)} placeholder="Napiš jen to, co chceš sdílet. Přesné místo ani soukromé údaje sem nepatří." /></label>
          {post && <p className="social-help">Aktuálně: {post.deleted ? "Příspěvek není zveřejněný" : visibilityLabels[post.visibility]}. Uložení znovu schválí vybrané údaje z deníku{photoId ? " a tuto fotografii" : ""}.</p>}
          <div className="social-button-row"><button className="social-primary" disabled={busy}>{busy ? "Ukládám…" : form.visibility === "private" ? "Uložit soukromou kopii" : "Schválit a sdílet"}</button>{post && !post.deleted && <button type="button" disabled={busy} onClick={() => perform(true)}>Odstranit sdílený příspěvek</button>}</div>
        </fieldset>
      </form>}
    </>}
    {feedback?.key === key && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "social-error" : "social-success"}>{feedback.error || feedback.message}</p>}
  </section>;
}
