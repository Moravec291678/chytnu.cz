import { supportProgressionSnapshot } from "./supportSnapshot.js";
import { useSupportClock } from "./useSupportClock.js";
import { useOptionalSync } from "../sync/context/syncContextValue.js";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/context/authContextValue.js";
import { useCatches } from "../catches/context/useCatches.js";
import { useTrips } from "../trips/context/useTrips.js";
import { useProgression } from "../progression/context/progressionContextValue.js";
import { createAdminClient } from "./adminClient.js";
import { useAdminResource } from "./useAdminSession.js";
import { SUPPORT_CATEGORIES, SUPPORT_STATUS_LABELS } from "./supportPolicy.js";
import ConfirmDialog from "../../shared/components/ConfirmDialog.jsx";
import "./UserSupportPanel.css";

const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("cs-CZ") : "Neuvedeno";
export default function UserSupportPanel() {
  const { user } = useAuth();
  return <section className="privacy-card support-user-panel"><h2>Podpora a dočasný přístup</h2><p>Podpora nemá automatický přístup k soukromému deníku. Pro konkrétní případ můžeš předat vybrané údaje a souhlas kdykoli odvolat. Přesné lokality ani poznámky k úlovkům se nepředávají.</p>
    {user?.uid ? <AuthenticatedSupport key={user.uid} uid={user.uid} /> : <p>Podpora účtu vyžaduje přihlášení. Místní deník zůstává dostupný i bez něj.</p>}
  </section>;
}
function AuthenticatedSupport({ uid }) {
  const now = useSupportClock();
  const sync = useOptionalSync();
  const client = useMemo(() => createAdminClient({ ownerId: uid }), [uid]);
  const resource = useAdminResource(client, "support.own");
  const catches = useCatches().state.catches, trips = useTrips().state.trips, progression = useProgression();
  const [description, setDescription] = useState(""), [category, setCategory] = useState("Účet"), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [caseId, setCaseId] = useState(""), [categories, setCategories] = useState([]), [catchIds, setCatchIds] = useState([]), [tripIds, setTripIds] = useState([]), [photoRefs, setPhotoRefs] = useState([]), [hours, setHours] = useState(24), [confirmation, setConfirmation] = useState(null);
  useEffect(() => { const refresh = resource.refresh; window.addEventListener("focus", refresh); window.addEventListener("online", refresh); return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); }; }, [resource.refresh]);
  const mutate = async (action, payload) => {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try { await client.request(action, payload); setMessage("Změna byla uložena. Soukromí ostatních záznamů se nemění."); setConfirmation(null); resource.refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const toggle = (array, key, setter, max = 20) => setter(array.includes(key) ? array.filter(v => v !== key) : array.length < max ? [...array, key] : array);
  const records = catches.filter(c => c.ownerId === uid && !c.deleted && c.sync?.status === "metadata-synced").slice(0, 100);
  const openCases = (resource.data?.cases ?? []).filter(c => !["Closed", "Resolved"].includes(c.status));
  const selectedCase = openCases.find(c => c.id === caseId);
  const readyPhotos = records.flatMap(c => (c.photos ?? []).filter(p => p.cloud?.state === "synced").map(p => ({ catchId: c.id, photoId: p.id, label: c.species || "Neurčený úlovek" })));
  const snapshot = { ...(categories.includes("progression") ? supportProgressionSnapshot(progression.summary, progression.events) : {}),
    ...(categories.includes("sync") && sync && Number.isInteger(sync.pending) ? {sync:{pending:sync.pending,code:sync.error ? "unavailable" : sync.pending ? "pending" : "ok"}} : {}) };
  const share = event => {
    event.preventDefault();
    setConfirmation({ action: "support.grant", payload: { caseId, categories, hours, catchIds: categories.includes("catches") ? catchIds : [], tripIds: categories.includes("trips") ? tripIds : [], photoRefs: categories.includes("photos") ? photoRefs : [], snapshot },
      title: "Udělit dočasný přístup podpoře?", description: `Případ: ${selectedCase?.category}. Kategorie: ${categories.map(c => SUPPORT_CATEGORIES[c]).join(", ")}. Platnost ${hours} hodin. Přístup má pouze pověřený pracovník přidělený k případu a každé čtení se zaznamená. Přesné GPS, soukromá místa a poznámky se nepředávají.` });
  };
  const download = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(resource.data, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "chytnucz-podpora.json"; link.click(); URL.revokeObjectURL(url); };
  return <>
    {resource.loading && <p role="status">Načítám případy a souhlasy…</p>}{(resource.error || error) && <p role="alert">{error || resource.error}</p>}{message && <p role="status">{message}</p>}
    <button type="button" onClick={resource.refresh}>Obnovit stav podpory</button>
    <details><summary>Založit případ podpory</summary><form onSubmit={e => { e.preventDefault(); void mutate("support.open", { category, description }); }}>
      <label>Oblast problému<select value={category} onChange={e => setCategory(e.target.value)}>{["Účet", "Úlovky a fotografie", "XP a postup", "Synchronizace", "Jiné"].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Popis problému<textarea value={description} onChange={e => setDescription(e.target.value)} minLength={3} maxLength={2000} required /></label><p>Neuváděj hesla, tokeny ani přesné soukromé lokality. Popis předáváš pověřené podpoře.</p><button disabled={busy} type="submit">Odeslat případ podpoře</button>
    </form></details>
    {!!openCases.length && <details><summary>Udělit podpoře dočasný přístup k vybraným údajům</summary><form onSubmit={share}>
      <label>Případ<select required value={caseId} onChange={e => setCaseId(e.target.value)}><option value="">Vyber případ</option>{openCases.map(c => <option key={c.id} value={c.id}>{c.category} · {date(c.createdAt)} · {c.id.slice(0,8)}</option>)}</select></label>
      <fieldset><legend>Co smí podpora zobrazit</legend>{Object.entries(SUPPORT_CATEGORIES).filter(([key]) => key !== "profile").map(([key, label]) => <label className="support-user-check" key={key}><input type="checkbox" checked={categories.includes(key)} onChange={() => toggle(categories, key, setCategories, 6)} />{label}</label>)}</fieldset>
      {categories.includes("catches") && <fieldset><legend>Synchronizované úlovky — nejvýše 20</legend>{records.map(c => <label className="support-user-check" key={c.id}><input type="checkbox" checked={catchIds.includes(c.id)} onChange={() => toggle(catchIds, c.id, setCatchIds)} />{c.species || "Druh neurčen"} · {date(c.caughtAt)}</label>)}</fieldset>}
      {categories.includes("photos") && <fieldset><legend>Synchronizované fotografie — nejvýše 40</legend>{readyPhotos.map(p => <label className="support-user-check" key={`${p.catchId}:${p.photoId}`}><input type="checkbox" checked={photoRefs.some(f => f.catchId === p.catchId && f.photoId === p.photoId)} onChange={() => setPhotoRefs(previous => previous.some(f => f.catchId === p.catchId && f.photoId === p.photoId) ? previous.filter(f => f.catchId !== p.catchId || f.photoId !== p.photoId) : previous.length < 40 ? [...previous, { catchId:p.catchId, photoId:p.photoId }] : previous)} />{p.label} · {p.photoId.slice(0,8)}</label>)}</fieldset>}
      {categories.includes("trips") && <fieldset><legend>Vybrané synchronizované vycházky</legend>{trips.filter(t => t.ownerId === uid && !t.deleted && t.sync?.status === "metadata-synced").slice(0,100).map(t => <label className="support-user-check" key={t.id}><input type="checkbox" checked={tripIds.includes(t.id)} onChange={() => toggle(tripIds, t.id, setTripIds)} />{date(t.startedAt)} · {t.status}</label>)}</fieldset>}
      {categories.includes("progression") && <details><summary>Náhled předávané diagnostiky postupu</summary><p>Souhrn a nejvýše 100 posledních odměn z tohoto zařízení; podpora uvidí, že jde o uživatelem předané podklady.</p><pre>{JSON.stringify(snapshot, null, 2)}</pre></details>}
      <label>Platnost<select value={hours} onChange={e => setHours(Number(e.target.value))}>{[1,24,72].map(h => <option key={h} value={h}>{h} hodin</option>)}</select></label><button type="submit" disabled={busy || !selectedCase || !categories.length || progression.loading && categories.includes("progression")}>Zkontrolovat a potvrdit souhlas</button>
    </form></details>}
    <p>Výpis a stažení obsahují nejvýše 50 případů, 200 posledních souhlasů a 20 posledních oprav XP.</p>
    <h3>Moje případy</h3><ul>{resource.data?.cases?.map(c => <li key={c.id}><strong>{c.category} · {SUPPORT_STATUS_LABELS[c.status]}</strong><p>{c.description}</p>{c.resolution && <p>Vyřešení: {c.resolution}</p>}<small>{date(c.updatedAt)}</small></li>)}</ul>
    <h3>Udělené souhlasy</h3><ul>{resource.data?.grants?.map(g => <li key={g.id}><strong>{g.categories.map(c => SUPPORT_CATEGORIES[c]).join(", ")}</strong><p>{g.revokedAt ? `Odvoláno ${date(g.revokedAt)}` : Date.parse(g.expiresAt) <= now ? "Platnost vypršela" : `Platí do ${date(g.expiresAt)}`}</p><small>Případ {g.caseId}</small>{!g.revokedAt && Date.parse(g.expiresAt) > now && <button disabled={busy} onClick={() => setConfirmation({ action:"support.revoke", payload:{grantId:g.id}, title:"Odvolat souhlas?", description:"Další čtení a načítání fotografií se zastaví. Již zobrazené údaje nelze zpětně vzít zpět." })}>Odvolat přístup</button>}</li>)}</ul>
    {!!resource.data?.adjustments?.length && <><h3>Opravy XP podporou</h3><ul>{resource.data.adjustments.map(a => <li key={a.id}>{date(a.createdAt)} · {a.delta} XP · {a.reason}</li>)}</ul></>}
    {resource.data && <button onClick={download}>Stáhnout údaje podpory</button>}
    {confirmation && <ConfirmDialog titleId="support-consent-title" descriptionId="support-consent-description" title={confirmation.title} description={confirmation.description} confirmLabel="Potvrdit" busyLabel="Ukládám…" busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void mutate(confirmation.action, confirmation.payload)} />}
  </>;
}
