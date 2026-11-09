import { useSupportClock } from "./useSupportClock.js";
import { getCatchStatistics, getCatchPatterns } from "../stats/utils/catchStatistics.js";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminResource } from "./useAdminSession.js";
import { hasAdminPermission } from "./adminClient.js";
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, SUPPORT_STATUS_LABELS } from "./supportPolicy.js";

const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("cs-CZ") : "Nedostupné";
const can = (access, permission) => hasAdminPermission(access, permission);
const TABS = { account: "Účet", public: "Veřejné úlovky", catches:"Vybrané úlovky", photos: "Fotografie", trips: "Vycházky", progression: "XP a level", achievements: "Achievementy", challenges: "Výzvy", sync:"Diagnostika", support: "Podpora", audit: "Historie" };
function Resource({ resource }) { return resource.loading ? <p role="status">Načítám…</p> : resource.error ? <p role="alert">{resource.error} <button onClick={resource.refresh}>Zkusit znovu</button></p> : null; }

export default function AdminUserDetail({ uid, client, access, change, busy, renderAccount }) {
  const account = useAdminResource(client, "users.get", { uid });
  const [tab, setTab] = useState("account"), [selectedGrant, setSelectedGrant] = useState(null);
  const supportAllowed = can(access, "support");
  return <section className="admin-panel"><Link to="/admin/users">← Seznam uživatelů</Link><h2>{account.data?.user?.displayName || "Detail účtu"}</h2>
    <Resource resource={account} />
    <nav className="admin-user-tabs" aria-label="Detail účtu">{Object.entries(TABS).filter(([key]) => key !== "support" || supportAllowed).map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === "account" && account.data?.user && <>{renderAccount(account.data.user, account.refresh)}
      <p className="admin-note">Veřejný profil a souhrnný level zatím nejsou serverově publikované. Seznam účtů proto neprohledává soukromé deníky ani neodhaduje XP.</p></>}
    {tab === "public" && <PublicCatches {...{ uid, client, access, change, busy }} />}
    {tab === "audit" && <UserHistory {...{ uid, client }} />}
    {tab === "support" && <SupportCases {...{ uid, client, access, change, busy }} />}
    {["catches", "photos", "trips", "progression", "achievements", "challenges", "sync"].includes(tab) && <>
      {tab === "photos" && <PublicCatches {...{ uid, client, access, change, busy }} photosOnly />}
      <h3>Vybrané soukromé údaje pro podporu</h3>
      <p className="admin-note">Přesné GPS, názvy soukromých míst a poznámky se nepředávají. Souhlas uživatele je v Soukromí → Podpora. Ani OWNER nemá trvalý neomezený přístup.</p>
      {supportAllowed ? <GrantPicker {...{ uid, client }} selected={selectedGrant} onChange={setSelectedGrant} /> : <p>Pro soukromé údaje chybí delegované oprávnění podpory.</p>}
      {selectedGrant && supportAllowed && <PrivateContent key={`${tab}:${selectedGrant.id}`} {...{ uid, client, access, change, busy }} tab={tab} grant={selectedGrant} />}
    </>}
  </section>;
}
function GrantPicker({ uid, client, selected, onChange }) {
  const now=useSupportClock();
  const resource = useAdminResource(client, "support.cases", { uid });
  const grants = (resource.data?.grants ?? []).filter(g => g.assignedToCurrentActor && !g.revokedAt && Date.parse(g.expiresAt) > now);
  return <><Resource resource={resource} /><label>Platný souhlas pro přidělený případ<select value={selected?.id ?? ""} onChange={event => onChange(grants.find(g => g.id === event.target.value) ?? null)}><option value="">Vyber souhlas</option>{grants.map(g => <option key={g.id} value={g.id}>{g.caseId.slice(0, 8)} · {g.categories.map(c => SUPPORT_CATEGORIES[c]).join(", ")} · do {date(g.expiresAt)}</option>)}</select></label><button onClick={resource.refresh}>Obnovit souhlasy</button>{!grants.length && <p>Pro tento účet nemáš aktuální souhlas. Přidělení případu samo o sobě soukromý deník neotevírá.</p>}</>;
}
function PrivateContent({ uid, client, access, change, busy, tab, grant }) {
  const category = ["achievements", "challenges"].includes(tab) ? "progression" : tab;
  if (!grant.categories.includes(category)) return <p>Tento souhlas kategorii „{SUPPORT_CATEGORIES[category]}“ nezahrnuje.</p>;
  return <AuthorizedContent {...{ uid, client, access, change, busy, tab, grant, category }} />;
}
function AuthorizedContent({ uid, client, access, change, busy, tab, grant, category }) {
  const resource = useAdminResource(client, "support.content", { uid, caseId: grant.caseId, grantId: grant.id, category });
  const data = resource.data;
  return <><p className="admin-support-banner">PŘÍSTUP PODPORY · případ {grant.caseId} · platnost do {date(grant.expiresAt)} · každé čtení se audituje.</p><Resource resource={resource} />
    {data && category === "progression" && <>
      <p className="admin-note">Zdroj: {data.source === "server_reconciled" ? "serverový souhrn včetně historické migrační baseline" : data.source === "user_reported" ? `diagnostika odeslaná uživatelem ${date(data.observedAt)}; nejde o úplný ověřený serverový ledger` : "nedostupný"}.</p>
      {tab === "progression" && <>{data.summary ? <dl className="admin-facts"><div><dt>XP</dt><dd>{data.summary.xp}</dd></div><div><dt>Level</dt><dd>{data.summary.level}</dd></div><div><dt>Hodnost</dt><dd>{data.summary.rank?.name}</dd></div><div><dt>Do další úrovně</dt><dd>{data.summary.nextThreshold === null ? "Maximum" : data.summary.nextThreshold - data.summary.xp}</dd></div><div><dt>Opravy podpory</dt><dd>{data.adjustmentXp}</dd></div><div><dt>Série (při odeslání)</dt><dd>{data.streak ?? "Nedostupné"}</dd></div></dl> : <p>XP nejsou v dostupných podkladech.</p>}
        <h4>Historie odměn předaná uživatelem</h4><SnapshotRows rows={data.rewards} />
        <h4>Druhové mistrovství při odeslání</h4><SnapshotRows rows={data.mastery} />
        {access.role === "OWNER" && data.summary && <XpCorrection {...{ uid, client, change, busy, grant }} refresh={resource.refresh} />}</>}
      {tab === "achievements" && <SnapshotRows rows={data.achievements} />}{tab === "challenges" && <SnapshotRows rows={data.challenges} />}
    </>}
    {data && category === "trips" && <ul className="admin-records">{data.records?.map(t => <li key={t.id}>{date(t.startedAt)} → {date(t.endedAt)} · {t.status || "Stav nedostupný"}</li>)}</ul>}
    {data && category === "photos" && <div className="admin-photo-grid">{data.records?.map(p => <PhotoCard key={p.id} client={client} input={{ uid, caseId: grant.caseId, grantId: grant.id, catchId: p.catchId, photoId: p.id }} label={`Fotografie · ${p.state}`} />)}</div>}
    {data && category === "catches" && <CatchRows records={data.records} />}
    {data && category === "sync" && <p>Stav při odeslání {date(data.observedAt)}: {data.diagnostics ? `${data.diagnostics.code} · ${data.diagnostics.pending} čekajících operací` : "Nepředáno"}. Nejde o aktuální online přítomnost.</p>}
    <p className="admin-note">Předané výběry nejsou celý deník. Nezahrnuté kategorie, neúspěšné výpravy a novější místní změny nelze z těchto podkladů dopočítat.</p>
  </>;
}
function SnapshotRows({ rows }) {
  if (!rows) return <p>Uživatel tuto historii nepředal; její úplná serverová kopie zatím není dostupná.</p>;
  if (!rows.length) return <p>V předaném výběru nejsou záznamy.</p>;
  return <ul className="admin-records">{rows.map((r, index) => <li key={`${r.id}:${index}`}><div><strong>{r.label || r.id}</strong><span>{r.completed === undefined ? "" : r.completed ? "Dokončeno · " : "Rozpracováno · "}{r.xp !== undefined ? `${r.xp} XP` : ""}{r.progress !== undefined ? ` · postup ${r.progress}` : ""}</span>{r.occurredAt && <time>{date(r.occurredAt)}</time>}</div></li>)}</ul>;
}
function CatchRows({ records = [] }) {
  return records.length ? <><SampleStatistics records={records} /><ul className="admin-records">{records.map(c => <li key={c.id}><div><strong>{c.species || "Druh neurčen"}</strong><span>{date(c.caughtAt)} · {c.lengthCm ? `${c.lengthCm} cm` : "Délka chybí"} · {c.weightKg ? `${c.weightKg} kg${c.weightSource === "estimated" ? " (odhad)" : ""}` : "Hmotnost chybí"}</span></div></li>)}</ul></> : <p>V tomto výběru nejsou dostupné úlovky.</p>;
}
function SampleStatistics({records}) {
  const now=useSupportClock(), stats=getCatchStatistics(records,[],new Date(now)), patterns=getCatchPatterns(records);
  return <details><summary>Statistiky tohoto výběru — {stats.catchCount} záznamů, {stats.speciesCount} určených druhů</summary>
    <p>Nejdelší ve výběru: {stats.longestLengthCm===null ? "neměřeno" : `${stats.longestLengthCm} cm`}. Nejvyšší měřená hmotnost: {stats.biggestWeightKg===null ? "neměřeno" : `${stats.biggestWeightKg} kg`}. Nejde o celkové osobní rekordy ani celou historii.</p>
    <p>Metody: {stats.methods.map(m=>`${m.label}: ${m.count}`).join(", ")||"Nepředány"}.</p>
    <p>Měsíční záznamy ve výběru: {stats.monthlyCatchCounts.map(m=>`${m.label}: ${m.count}`).join(", ")}.</p>
    <p>Návnady: {patterns.bait?.labels?.join(", ") || "Pro opakující se vzorec chybí podklady"}. Doba rybolovu a neúspěšné výpravy nejsou v tomto výběru zahrnuté.</p>
  </details>;
}
function PublicCatches({ uid, client, access, change, busy, photosOnly = false }) {
  const [cursor, setCursor] = useState(null), [reason, setReason] = useState("");
  const resource = useAdminResource(client, "users.public", { uid, ...(cursor ? { cursor } : {}) });
  const records = resource.data?.records ?? [];
  return <><Resource resource={resource} /><p className="admin-note">Pouze skutečně veřejné úlovky. Soukromé fotografie se nezobrazí ani u veřejného úlovku. Stránka obsahuje nejvýše 20 záznamů; nejde o celkové statistiky rybáře.</p>
    {!photosOnly && <CatchRows records={records} />}
    <div className="admin-photo-grid">{records.flatMap(c => c.publicPhotos.map(photoId => <PhotoCard key={`${c.id}:${photoId}`} client={client} input={{ uid, catchId: c.id, photoId }} label={c.species || "Veřejná fotografie"} />))}</div>
    {!photosOnly && can(access, "moderation") && <><label>Důvod moderace<input maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label><ul className="admin-records">{records.map(c => <li key={c.id}><span>{c.species} · {c.moderation.hidden ? "Veřejné zobrazení skryté" : "Veřejně dostupné"}</span><button disabled={busy || reason.trim().length < 3} onClick={() => change("moderation.set", { uid, catchId: c.id, hidden: !c.moderation.hidden, reason, expectedRevision: c.moderation.revision }, resource.refresh, "Změnit pouze veřejné zobrazení? Osobní fotografie a úlovek se nesmažou. Uživatel dostane oznámení s důvodem.")}>{c.moderation.hidden ? "Obnovit veřejné zobrazení" : "Skrýt veřejné zobrazení"}</button></li>)}</ul><p className="admin-note">Příjem globálních komunitních hlášení zatím není připojený. Zde se skutečně moderují veřejné záznamy vybraného účtu, bez fiktivních reportů.</p></>}
    <div className="admin-actions">{cursor && <button onClick={() => setCursor(null)}>První stránka</button>}{resource.data?.nextCursor && <button onClick={() => setCursor(resource.data.nextCursor)}>Další veřejné úlovky</button>}</div>
  </>;
}
function PhotoCard({ client, input, label }) {
  const active = useRef(true);
  useEffect(()=>()=>{active.current=false;},[]);
  const [photo, setPhoto] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  const load = async () => {
    setLoading(true); setError("");
    try { const bytes = await client.request("support.photo", input, { responseType: "blob" }); if(active.current)setPhoto(URL.createObjectURL(bytes)); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  return <article className="admin-photo-card"><strong>{label}</strong>{photo ? <><img src={photo} alt={label} loading="lazy" /><a href={photo} target="_blank" rel="noreferrer">Otevřít fotografii</a></> : <button disabled={loading} onClick={() => void load()}>{loading ? "Ověřuji přístup…" : "Načíst bezpečný náhled"}</button>}{error && <p role="alert">{error}</p>}</article>;
}
function XpCorrection({ uid, client, change, busy, grant, refresh }) {
  const [delta, setDelta] = useState(0), [reason, setReason] = useState(""), [preview, setPreview] = useState(null), [error, setError] = useState("");
  const check = async () => { try { setError(""); const result = await client.request("progression.preview", { uid, caseId: grant.caseId, grantId: grant.id, delta }); setPreview({ ...result, operationId: crypto.randomUUID(), reason }); } catch (e) { setError(e.message); } };
  return <section className="admin-subpanel"><h4>Auditovaná oprava XP — pouze OWNER</h4><p>Oprava přidá samostatný serverový záznam. Původní odměny a automatické achievementy se nepřepisují.</p>
    <label>Změna XP (−10 000 až +10 000)<input type="number" min="-10000" max="10000" step="1" value={delta} onChange={e => { setDelta(Number(e.target.value)); setPreview(null); }} /></label>
    <label>Důvod opravy<textarea maxLength={1000} value={reason} onChange={e => { setReason(e.target.value); setPreview(null); }} /></label><button disabled={busy || !delta || reason.trim().length < 3} onClick={() => void check()}>Připravit náhled změny</button>
    {error && <p role="alert">{error}</p>}{preview && <><p>Před: {preview.summary.xp} XP → Po: {preview.after} XP. Změna: {preview.delta}. Zdroj základu: {preview.source === "user_reported" ? "uživatelem předaná diagnostika; může být neaktuální" : "serverový souhrn"}.</p><button disabled={busy} onClick={() => change("progression.adjust", { uid, caseId: grant.caseId, grantId: grant.id, delta: preview.delta, reason: preview.reason, operationId: preview.operationId, expectedRevision: preview.revision, expectedBaseXp: preview.baseXp }, () => { setPreview(null); refresh(); }, `Potvrdit ${preview.delta} XP pro tento účet? Před ${preview.summary.xp}, po ${preview.after}. Důvod: ${preview.reason}`)}>Potvrdit opravu XP</button></>}
  </section>;
}
function SupportCases({ uid, client, access, change, busy }) {
  const [description,setDescription]=useState("");
  const resource = useAdminResource(client, "support.cases", { uid });
  return <><Resource resource={resource} /><form className="admin-form" onSubmit={e=>{e.preventDefault();change("support.case.open",{uid,category:"Podpora účtu",description},()=>{setDescription("");resource.refresh();},"Založit případ pro tento účet? Popis bude sdílený s uživatelem; soukromý deník zůstane uzavřený.");}}><label>Nový případ — popis sdílený s uživatelem<textarea required minLength={3} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} /></label><button disabled={busy}>Založit případ</button></form><p>Uživatel může založit případ v Soukromí → Podpora. Přístup k soukromému obsahu vyžaduje samostatný souhlas pro přiděleného pracovníka.</p>
    {(resource.data?.cases ?? []).map(c => <CaseEditor key={`${c.id}:${c.revision}`} value={c} access={access} busy={busy} notes={(resource.data?.notes ?? []).filter(n => n.caseId === c.id)} save={payload => change("support.case.save", { uid, caseId: c.id, expectedRevision: c.revision, ...payload }, resource.refresh, "Uložit stav případu a interní poznámku? Poznámky zůstávají pouze pověřené podpoře.")} />)}
    {!resource.loading && !resource.data?.cases?.length && <p>Pro tento účet nemáš přidělené případy.</p>}</>;
}
function CaseEditor({ value, access, busy, notes, save }) {
  const [status, setStatus] = useState(value.status), [priority, setPriority] = useState(value.priority), [assignedTo, setAssignedTo] = useState(value.assignedTo), [note, setNote] = useState(""), [resolution, setResolution] = useState(value.resolution ?? "");
  return <details className="admin-subpanel"><summary>{value.category} · {SUPPORT_STATUS_LABELS[value.status]} · {date(value.createdAt)}</summary><p>{value.description}</p><code>{value.id}</code>
    <form className="admin-form" onSubmit={e => { e.preventDefault(); save({ status, priority, ...(access.role === "OWNER" ? { assignedTo } : {}), note, resolution }); }}>
      <label>Stav<select value={status} onChange={e => setStatus(e.target.value)}>{SUPPORT_STATUSES.map(s => <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>)}</select></label><label>Priorita<select value={priority} onChange={e => setPriority(e.target.value)}>{["low", "normal", "high"].map(p => <option key={p}>{p}</option>)}</select></label>
      {access.role === "OWNER" && <label>UID pověřeného pracovníka podpory<input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} maxLength={128} /><small>Po změně přidělení je pro soukromý obsah nutný nový uživatelský souhlas.</small></label>}
      <label>Interní poznámka<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></label><label>Vyřešení — sdílí se s uživatelem<textarea value={resolution} onChange={e => setResolution(e.target.value)} maxLength={2000} required={["Closed", "Resolved"].includes(status)} /></label><button disabled={busy} type="submit">Uložit případ</button>
    </form><h4>Interní poznámky</h4><ul>{notes.map(n => <li key={n.id}>{date(n.createdAt)} · {n.text}</li>)}</ul>
  </details>;
}
function UserHistory({ uid, client }) {
  const [cursor, setCursor] = useState(null), resource = useAdminResource(client, "users.history", { uid, ...(cursor ? { cursor } : {}) });
  return <><Resource resource={resource} /><p className="admin-note">Serverový audit účtu, nejvýše 50 záznamů na stránku. Stránkování je podle ID; časy jednotlivých událostí jsou skutečné.</p><ul className="admin-records">{resource.data?.entries?.map(e => <li key={e.id}>{date(e.createdAt)} · {e.action} · {e.actorRole}</li>)}</ul>{resource.data?.nextCursor && <button onClick={() => setCursor(resource.data.nextCursor)}>Další historie</button>}</>;
}
