import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import Layout from "../../shared/layout/Layout.jsx";
import ConfirmDialog from "../../shared/components/ConfirmDialog.jsx";
import { canOpenAdmin, hasAdminPermission } from "./adminClient.js";
import { useAdminSession, useAdminResource } from "./useAdminSession.js";
import "./AdminDashboard.css";

const CAPABILITIES = { species: "Rozpoznávání ryb", diary: "AI rozbor deníku", recommendations: "AI doporučení", stories: "AI vyprávění" };
const AUDIENCE_NAMES = { everyone: "Všichni", testers: "Testeři", owner: "Pouze OWNER", selected: "Vybrané účty", disabled: "Vypnuto" };
const PERMISSIONS = { "users.read": "Čtení účtů", "users.manage": "Správa běžných účtů", tasks: "Úkoly", audit: "Audit", monitoring: "Provoz a monitoring" };
const CATEGORIES = ["Bug", "Feature", "Improvement", "Design", "Security", "Maintenance"];
const CATEGORY_NAMES = { Bug: "Chyba", Feature: "Funkce", Improvement: "Vylepšení", Design: "Design", Security: "Bezpečnost", Maintenance: "Údržba" };
const STATUSES = ["New", "Planned", "In Progress", "Testing", "Done", "Cancelled"];
const STATUS_NAMES = { New: "Nový", Planned: "Plánovaný", "In Progress": "Rozpracovaný", Testing: "Testování", Done: "Hotový", Cancelled: "Zrušený" };
const PRIORITIES = { low: "Nízká", normal: "Běžná", high: "Vysoká", critical: "Kritická" };
const NAVIGATION = [["", "Přehled", null], ["users", "Uživatelé", "users.read"], ["limits", "Limity", "owner"],
  ["features", "Funkce", "owner"], ["ai", "AI", "monitoring"], ["tasks", "Úkoly a vývoj", "tasks"],
  ["monitoring", "Provoz", "monitoring"], ["audit", "Audit", "audit"], ["settings", "Nastavení", "owner"]];
const timestamp = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("cs-CZ") : "Nedostupné";
const metric = value => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("cs-CZ") : "Nedostupné";
const datetimeInput = value => {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const date = new Date(value); return new Date(date - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const permitted = (access, permission) => !permission || (permission === "owner" ? access.role === "OWNER" : hasAdminPermission(access, permission)
  || (permission === "users.read" && hasAdminPermission(access, "users.manage")));

export default function AdminDashboard() {
  const session = useAdminSession();
  if (session.loading) return <Layout><section className="admin-page"><h1>Administrace ChytnuCz</h1><p role="status">Ověřuji oprávnění…</p><Link to="/profile">Zpět do aplikace</Link></section></Layout>;
  if (!canOpenAdmin(session.access)) return <Layout><section className="admin-page"><h1>Administrace ChytnuCz</h1>
    <p role="alert">{session.error || (session.ownerId ? "K administraci nemáš oprávnění." : "Pro přístup do administrace se přihlas pověřeným účtem.")}</p>
    {session.ownerId && <button type="button" onClick={session.refresh}>Ověřit znovu</button>}<Link to="/profile">Zpět do aplikace</Link>
  </section></Layout>;
  return <AdminWorkspace key={session.ownerId} session={session} />;
}

export function AdminWorkspace({ session }) {
  const { client, access } = session;
  const location = useLocation();
  const section = location.pathname.slice("/admin".length).replace(/^\//, "");
  const item = NAVIGATION.find(([path]) => path === section);
  const [confirmation, setConfirmation] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const mutate = async ({ action, payload, saved }) => {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { const result = await client.request(action, payload); saved?.(result); setMessage("Změna byla uložena na serveru."); setConfirmation(null); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const change = (action, payload, saved, description) => {
    setError(""); setMessage("");
    if (description) setConfirmation({ action, payload, saved, description }); else void mutate({ action, payload, saved });
  };
  return <Layout><div className="admin-page">
    <header className="admin-header"><div><p className="admin-kicker">{access.role}</p><h1>Administrace ChytnuCz</h1></div><Link to="/profile">← Zpět do aplikace</Link></header>
    <nav className="admin-nav" aria-label="Sekce administrace">{NAVIGATION.filter(([, , permission]) => permitted(access, permission)).map(([path, label]) =>
      <NavLink key={path} to={`/admin${path ? `/${path}` : ""}`} end>{label}</NavLink>)}</nav>
    <p className="admin-note">Správa neumožňuje prohlížení soukromých úlovků, fotografií ani přesných míst rybářů.</p>
    {message && <p role="status" className="admin-success">{message}</p>}{error && <p role="alert" className="admin-error">{error}</p>}
    {!item || !permitted(access, item[2]) ? <p role="alert">Tato sekce není pro tvé oprávnění dostupná.</p>
      : section === "users" ? <UsersPanel client={client} access={access} change={change} busy={busy} />
        : section === "tasks" ? <TasksPanel client={client} change={change} busy={busy} />
          : ["limits", "features", "settings"].includes(section) ? <ConfigurationPanel key={section} section={section} client={client} change={change} busy={busy} />
            : section === "audit" ? <AuditPanel client={client} />
              : ["ai", "monitoring"].includes(section) ? <MonitoringPanel client={client} ai={section === "ai"} access={access} />
                : <OverviewPanel client={client} access={access} />}
    {confirmation && <ConfirmDialog titleId="admin-confirm-title" descriptionId="admin-confirm-description" title="Potvrdit administrativní změnu?"
      description={confirmation.description} busy={busy} confirmLabel="Potvrdit změnu" busyLabel="Ukládám…" confirmClassName="admin-confirm-button"
      onCancel={() => setConfirmation(null)} onConfirm={() => void mutate(confirmation)} />}
  </div></Layout>;
}

function ResourceStatus({ resource }) {
  if (resource.loading) return <p role="status">Načítám údaje ze serveru…</p>;
  return resource.error ? <div role="alert" className="admin-error"><p>{resource.error}</p><button type="button" onClick={resource.refresh}>Zkusit znovu</button></div> : null;
}
function Facts({ items }) { return <dl className="admin-facts">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "Nedostupné"}</dd></div>)}</dl>; }
function Pagination({ nextCursor, cursor, setCursor, history, setHistory }) {
  return <div className="admin-actions"><button type="button" disabled={!history.length} onClick={() => { setCursor(history.at(-1)); setHistory(history.slice(0, -1)); }}>Předchozí stránka</button>
    <button type="button" disabled={!nextCursor} onClick={() => { setHistory([...history, cursor]); setCursor(nextCursor); }}>Další stránka</button></div>;
}
function OverviewPanel({ client, access }) {
  const resource = useAdminResource(client, "overview");
  const data = resource.data;
  return <section className="admin-panel"><h2>Přehled</h2><ResourceStatus resource={resource} />{data && <>
    <Facts items={[["Registrovaní uživatelé", metric(data.registeredUsers)], ["Testeři", metric(data.testers)], ["Pozastavené účty", metric(data.suspended)],
      ["Spravované účty", metric(data.managedUsers)], ["Otevřené úkoly", metric(data.openTasks)], ["Verze aplikace", data.version], ["Provoz", data.health?.adminApi === "available" ? "Admin API odpovídá" : "Nedostupné"]]} />
    {data.countsBounded && <p className="admin-note">Počty spravovaných účtů jsou omezené dostupným provozním registrem. Registr není úplným seznamem všech registrací Firebase.</p>}
    <h3>Podporované funkce</h3><CapabilityFacts features={data.features} />
    {hasAdminPermission(access, "tasks") && <Link to="/admin/tasks">Otevřít úkoly a vývoj →</Link>}
  </>}</section>;
}
function CapabilityFacts({ features }) {
  return <Facts items={Object.entries(CAPABILITIES).map(([key, label]) => [label, AUDIENCE_NAMES[features?.[key]?.audience ?? features?.[key]?.mode] ?? "Nedostupné"])} />;
}

function UsersPanel({ client, access, change, busy }) {
  const [filters, setFilters] = useState({ search: "", role: "", status: "" }), [query, setQuery] = useState({});
  const [cursor, setCursor] = useState(null), [history, setHistory] = useState([]), [selected, setSelected] = useState(null);
  const resource = useAdminResource(client, "users.list", { ...query, ...(cursor ? { cursor } : {}) });
  const applyFilters = event => { event.preventDefault(); setQuery(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))); setCursor(null); setHistory([]); };
  return <section className="admin-panel"><h2>Správa uživatelů</h2>
    <form className="admin-filter" onSubmit={applyFilters}><label>Přesné UID nebo e-mail<input maxLength={254} value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} /></label>
      <label>Role<select value={filters.role} onChange={event => setFilters({ ...filters, role: event.target.value })}><option value="">Všechny role</option>{["OWNER", "ADMIN", "TESTER", "USER"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Stav<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">Všechny stavy</option><option value="active">Aktivní</option><option value="suspended">Pozastavený</option></select></label><button type="submit">Vyhledat</button></form>
    <p className="admin-note">Hledání používá přesné UID nebo e-mail. Filtry se vyhodnocují v právě načtené omezené stránce, nikoli skenováním celé databáze.</p>
    <ResourceStatus resource={resource} />
    {resource.data && <><ul className="admin-records">{resource.data.users?.map(user => <li key={user.uid}><div><strong>{user.email || user.displayName || "Účet bez e-mailu"}</strong><code>{user.uid}</code><span>{user.role} · {user.suspended || user.disabled ? "Pozastavený" : "Aktivní"}</span></div><button type="button" onClick={() => setSelected(user.uid)}>Detail účtu</button></li>)}</ul>
      {!resource.data.users?.length && <p>Na této stránce nebyl nalezen odpovídající účet.</p>}
      <Pagination nextCursor={resource.data.nextCursor} {...{ cursor, setCursor, history, setHistory }} /></>}
    {selected && <UserEditor key={selected} uid={selected} {...{ client, access, change, busy }} onSaved={resource.refresh} onClose={() => setSelected(null)} />}
  </section>;
}

function UserEditor({ uid, client, access, change, busy, onSaved, onClose }) {
  const resource = useAdminResource(client, "users.get", { uid });
  return <section className="admin-subpanel"><div className="admin-header"><h3>Detail účtu</h3><button type="button" onClick={onClose}>Zavřít detail</button></div><ResourceStatus resource={resource} />
    {resource.data?.user && <UserForm key={`${uid}:${resource.data.user.revision}`} user={resource.data.user} {...{ access, busy }}
      save={patch => change("users.update", { uid, patch, expectedRevision: resource.data.user.revision }, () => { resource.refresh(); onSaved(); }, `Uložit změny role, stavu nebo oprávnění účtu ${uid}? Změna se zapíše do auditu. Pozastavení nesmaže jeho rybářská data.`)} />}
  </section>;
}
function UserForm({ user, access, busy, save }) {
  const [values, setValues] = useState(() => ({ role: user.role, suspended: Boolean(user.suspended || user.disabled), permissions: user.permissions ?? [],
    limits: user.limits ?? {}, entitlements: user.entitlements ?? {}, overrideExpiresAt: datetimeInput(user.overrideExpiresAt) }));
  const owner = access.role === "OWNER", protectedUser = user.role === "OWNER" || (!owner && user.role === "ADMIN");
  const editable = !protectedUser && (owner || hasAdminPermission(access, "users.manage"));
  const set = (key, value) => setValues(previous => ({ ...previous, [key]: value }));
  const submit = event => {
    event.preventDefault();
    const patch = owner ? { ...values, permissions: values.role === "ADMIN" ? values.permissions : [], overrideExpiresAt: values.overrideExpiresAt ? new Date(values.overrideExpiresAt).toISOString() : null } : { suspended: values.suspended };
    save(patch);
  };
  return <form onSubmit={submit} className="admin-form"><Facts items={[["UID", user.uid], ["E-mail", user.email], ["Vytvořen", timestamp(user.createdAt)], ["Poslední přihlášení", timestamp(user.lastSignInAt)]]} />
    {user.authState === "pending" && <p role="status">Synchronizace stavu účtu s Firebase Authentication čeká na dokončení. Zopakuj změnu stavu.</p>}
    {owner && <label>Role<select disabled={!editable || busy} value={values.role} onChange={event => set("role", event.target.value)}>
      {user.role === "OWNER" ? <option>OWNER</option> : ["USER", "TESTER", "ADMIN"].map(role => <option key={role}>{role}</option>)}
    </select></label>}
    <label className="admin-check"><input type="checkbox" checked={values.suspended} disabled={!editable || busy} onChange={event => set("suspended", event.target.checked)} />Pozastavit účet</label>
    {owner && <><fieldset disabled={!editable || busy}><legend>Delegovaná oprávnění ADMIN</legend>{Object.entries(PERMISSIONS).map(([key, label]) => <label key={key} className="admin-check"><input type="checkbox" checked={values.permissions.includes(key)} onChange={event => set("permissions", event.target.checked ? [...values.permissions, key] : values.permissions.filter(value => value !== key))} />{label}</label>)}</fieldset>
      <UserLimitFields values={values.limits} onChange={value => set("limits", value)} disabled={!editable || busy} />
      <fieldset disabled={!editable || busy}><legend>Individuální dostupnost AI funkcí</legend>{Object.entries(CAPABILITIES).map(([key, label]) => <label key={key}>{label}<select value={values.entitlements[key] === undefined ? "default" : values.entitlements[key] ? "yes" : "no"}
        onChange={event => { const next = { ...values.entitlements }; if (event.target.value === "default") delete next[key]; else next[key] = event.target.value === "yes"; set("entitlements", next); }}><option value="default">Podle globálního nastavení</option><option value="yes">Povolit</option><option value="no">Zakázat</option></select></label>)}</fieldset>
      <label>Platnost individuálních výjimek do (volitelné)<input type="datetime-local" value={values.overrideExpiresAt} disabled={!editable || busy} onChange={event => set("overrideExpiresAt", event.target.value)} /></label>
      <p className="admin-note">Dostupnost funkce nenahrazuje souhlas uživatele. Výjimka neobchází globální bezpečnostní limit ani kapacitu poskytovatele.</p>
    </>}
    {protectedUser && <p>Účet vlastníka a oprávnění nadřazeného správce jsou chráněné.</p>}
    {editable && <button type="submit" disabled={busy}>Uložit změny účtu</button>}
  </form>;
}

const LIMIT_LABELS = { userDailyReservation: "Denní interní rezervace uživatele (neurony)", testerDailyReservation: "Denní limit testera (neurony)",
  globalDailyReservation: "Globální denní bezpečnostní limit (neurony)", textDailyReservation: "Denní globální rezervace textových funkcí (neurony)" };
function UserLimitFields({ values, onChange, disabled }) {
  const key = "dailyReservation";
  return <fieldset disabled={disabled}><legend>Individuální interní AI limit</legend><label>Denní rezervace (neurony, prázdné = výchozí)<input type="number" min="0" max="5000" step="1" value={values[key] ?? ""}
    onChange={event => { const next = { ...values }; if (event.target.value === "") delete next[key]; else next[key] = Number(event.target.value); onChange(next); }} /></label></fieldset>;
}

function ConfigurationPanel({ client, section, change, busy }) {
  const resource = useAdminResource(client, "config.get");
  return <section className="admin-panel"><h2>{section === "features" ? "Správa funkcí" : section === "limits" ? "Limity a oprávnění" : "Nastavení provozních politik"}</h2>
    <ResourceStatus resource={resource} />{resource.data?.config && <ConfigurationForm key={`${section}:${resource.data.config.revision}`} config={resource.data.config} section={section} busy={busy}
      save={patch => change("config.update", { patch, expectedRevision: resource.data.config.revision }, resource.refresh, "Změnit globální provozní nastavení aplikace? Změna bude zapsaná v auditu. Externí bezplatné kvóty a uživatelské souhlasy zůstávají závazné.")} />}
  </section>;
}
function ConfigurationForm({ config, section, save, busy }) {
  const [limits, setLimits] = useState(() => ({ ...config.limits })), [features, setFeatures] = useState(() => structuredClone(config.features ?? {}));
  const [selectedUids, setSelectedUids] = useState(() => Object.fromEntries(Object.entries(config.features ?? {}).map(([key, value]) => [key, (value.userIds ?? []).join("\n")])));
  const showLimits = section !== "features", showFeatures = section !== "limits";
  return <form className="admin-form" onSubmit={event => { event.preventDefault(); const nextFeatures = Object.fromEntries(Object.entries(features).map(([key, value]) => [key, { ...value, userIds: (selectedUids[key] ?? "").split(/\s+/).filter(Boolean) }])); save({ ...(showLimits ? { limits } : {}), ...(showFeatures ? { features: nextFeatures } : {}) }); }}>
    {showLimits && <fieldset disabled={busy}><legend>Interní AI limity</legend>{Object.entries(limits).filter(([key]) => LIMIT_LABELS[key]).map(([key, value]) => <label key={key}>{LIMIT_LABELS[key]}
      <input type="number" min="0" max={key === "globalDailyReservation" ? "7500" : key === "textDailyReservation" ? "1000" : "5000"} step="1" required value={value}
        onChange={event => setLimits({ ...limits, [key]: Number(event.target.value) })} /></label>)}
      <p className="admin-note">OWNER nemá běžný interní limit uživatele. Globální ochranné rezervace, limit textových požadavků a bezplatná kapacita Cloudflare platí vždy.</p>
    </fieldset>}
    {showFeatures && <fieldset disabled={busy}><legend>Dostupnost podporovaných funkcí</legend>{Object.entries(CAPABILITIES).map(([key, label]) => {
      const feature = features[key] ?? { audience: "disabled", userIds: [] };
      return <div className="admin-feature" key={key}><label>{label}<select value={feature.audience ?? feature.mode ?? "disabled"} onChange={event => setFeatures({ ...features, [key]: { ...feature, audience: event.target.value } })}>
        {[['everyone','Všichni'],['testers','Testeři'],['owner','Pouze OWNER'],['selected','Vybrané účty'],['disabled','Vypnuto']].map(([value, text]) => <option value={value} key={value}>{text}</option>)}
      </select></label>{feature.audience === "selected" && <label>UID vybraných účtů (jedno na řádek, nejvýše 100)<textarea rows="3" maxLength={13000} value={selectedUids[key] ?? ""}
        onChange={event => setSelectedUids({ ...selectedUids, [key]: event.target.value })} /></label>}</div>;
    })}<p className="admin-note">Tyto volby mění dostupnost externí AI. Nezastavují místní ukládání, deník, bezpečnost ani offline funkce. Souhlas uživatele je vyžadován samostatně.</p></fieldset>}
    <button type="submit" disabled={busy}>Uložit provozní nastavení</button>
  </form>;
}

function TasksPanel({ client, change, busy }) {
  const [filters, setFilters] = useState({ search: "", status: "", category: "" }), [query, setQuery] = useState({});
  const [cursor, setCursor] = useState(null), [history, setHistory] = useState([]), [edited, setEdited] = useState(null), [creating, setCreating] = useState(false);
  const resource = useAdminResource(client, "tasks.list", { ...query, ...(cursor ? { cursor } : {}) });
  const save = task => change("tasks.save", { ...(edited ? { id: edited.id, expectedRevision: edited.revision } : {}), task }, () => { resource.refresh(); setEdited(null); setCreating(false); });
  return <section className="admin-panel"><h2>Úkoly a vývoj</h2><p className="admin-note">Interní backlog správy aplikace; bez přístupu ke zdrojovému kódu a soukromému deníku.</p>
    <form className="admin-filter" onSubmit={event => { event.preventDefault(); setQuery(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))); setCursor(null); setHistory([]); }}>
      <label>Hledat v úkolech<input value={filters.search} maxLength={120} onChange={event => setFilters({ ...filters, search: event.target.value })} /></label>
      <label>Stav<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">Všechny</option>{STATUSES.map(value => <option key={value} value={value}>{STATUS_NAMES[value]}</option>)}</select></label>
      <label>Kategorie<select value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value })}><option value="">Všechny</option>{CATEGORIES.map(value => <option key={value} value={value}>{CATEGORY_NAMES[value]}</option>)}</select></label><button type="submit">Použít filtr</button></form>
    <button type="button" onClick={() => { setEdited(null); setCreating(true); }}>Nový úkol</button>
    <p className="admin-note">Hledání a filtry pracují s aktuální omezenou stránkou úkolů.</p><ResourceStatus resource={resource} />
    {resource.data && <><ul className="admin-records">{resource.data.tasks?.map(task => <li key={task.id}><div><strong>{task.title}</strong><span>{CATEGORY_NAMES[task.category]} · {STATUS_NAMES[task.status]} · {PRIORITIES[task.priority]}</span><span>{task.dueAt ? `Termín: ${timestamp(task.dueAt)}` : "Bez termínu"}</span></div>
      <div className="admin-actions"><button type="button" onClick={() => { setEdited(task); setCreating(false); }}>Upravit úkol</button><button type="button" disabled={busy} onClick={() => change("tasks.delete", { id: task.id, expectedRevision: task.revision }, resource.refresh, `Trvale odstranit interní úkol „${task.title}“?`)}>Smazat úkol</button></div></li>)}</ul>
      {!resource.data.tasks?.length && <p>Na této stránce nejsou odpovídající úkoly.</p>}<Pagination nextCursor={resource.data.nextCursor} {...{ cursor, setCursor, history, setHistory }} /></>}
    {(creating || edited) && <TaskForm key={edited?.id ?? "new"} task={edited} busy={busy} save={save} close={() => { setCreating(false); setEdited(null); }} />}
  </section>;
}
function TaskForm({ task, save, close, busy }) {
  const [values, setValues] = useState(() => ({ title: task?.title ?? "", description: task?.description ?? "", category: task?.category ?? "Bug", priority: task?.priority ?? "normal", status: task?.status ?? "New", dueAt: datetimeInput(task?.dueAt) }));
  const set = (key, value) => setValues(previous => ({ ...previous, [key]: value }));
  return <form className="admin-form admin-subpanel" onSubmit={event => { event.preventDefault(); save({ ...values, dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null }); }}>
    <h3>{task ? "Upravit úkol" : "Nový úkol"}</h3><label>Název<input maxLength={120} required value={values.title} onChange={event => set("title", event.target.value)} /></label>
    <label>Popis<textarea rows="4" maxLength={4000} value={values.description} onChange={event => set("description", event.target.value)} /></label>
    <label>Kategorie<select value={values.category} onChange={event => set("category", event.target.value)}>{CATEGORIES.map(value => <option key={value} value={value}>{CATEGORY_NAMES[value]}</option>)}</select></label>
    <label>Priorita<select value={values.priority} onChange={event => set("priority", event.target.value)}>{Object.entries(PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Stav<select value={values.status} onChange={event => set("status", event.target.value)}>{STATUSES.map(value => <option key={value} value={value}>{STATUS_NAMES[value]}</option>)}</select></label>
    <label>Termín (volitelný)<input type="datetime-local" value={values.dueAt} onChange={event => set("dueAt", event.target.value)} /></label>
    <div className="admin-actions"><button type="submit" disabled={busy}>Uložit úkol</button><button type="button" onClick={close}>Zrušit úpravy</button></div>
  </form>;
}

function AuditPanel({ client }) {
  const [cursor, setCursor] = useState(null), [history, setHistory] = useState([]);
  const resource = useAdminResource(client, "audit.list", cursor ? { cursor } : {});
  return <section className="admin-panel"><h2>Audit administrativních změn</h2><ResourceStatus resource={resource} />{resource.data && <>
    <ul className="admin-records">{resource.data.entries?.map(entry => <li key={entry.id}><div><strong>{entry.action}</strong><span>{timestamp(entry.createdAt ?? entry.timestamp)}</span>
      <span>Správce: <code>{entry.actorUid ?? entry.actor}</code></span><span>Cíl: <code>{entry.targetUid ?? entry.target ?? "Provozní nastavení"}</code></span></div></li>)}</ul>
    {!resource.data.entries?.length && <p>Audit zatím neobsahuje záznamy.</p>}<Pagination nextCursor={resource.data.nextCursor} {...{ cursor, setCursor, history, setHistory }} />
  </>}</section>;
}
function MonitoringPanel({ client, ai, access }) {
  const resource = useAdminResource(client, "monitoring");
  const data = resource.data;
  return <section className="admin-panel"><h2>{ai ? "AI management" : "Provoz a monitoring"}</h2><ResourceStatus resource={resource} />{data && <>
    <Facts items={[["Verze / nasazení", data.version], ["Admin API", data.serviceHealth === "available" ? "Dostupné" : "Nedostupné"],
      ["Poskytovatel AI", data.provider?.configured ? "Cloudflare — server nakonfigurován" : "Nedostupné"], ["AI model", data.provider?.model],
      ["Ochrana nulového rozpočtu", data.provider?.zeroCostConfirmed ? "Zapnutá" : "Nedostupné"], ["Požadavky AI (posledních 30 dnů)", metric(data.ai?.providerRequests)],
      ["Úspěšné odpovědi AI", metric(data.ai?.providerSuccesses)], ["Chyby AI", metric(data.ai?.providerErrors)], ["Poslední bezpečný kód chyby", data.ai?.lastErrorCode],
      ["Poslední požadavek", timestamp(data.ai?.lastRequestAt)], ["Rezervované neurony dnes", metric(data.quota?.reservedNeurons)], ["Rezervace textu dnes", metric(data.quota?.textReservedNeurons)],
      ["Odložené úlohy na zařízeních", "Nedostupné — zůstávají v soukromém místním úložišti"], ["Chyby synchronizace uživatelů", metric(data.syncErrors)], ["Selhání nahrávání fotografií", metric(data.photoUploadFailures)]]} />
    <p className="admin-note">Konfigurace poskytovatele nepotvrzuje aktuální dostupnost modelu. Otevření této stránky nespouští inferenci ani nespotřebovává AI kvótu. Nezobrazuje fotografie, raw prompty ani přihlašovací údaje.</p>
    {access.role === "OWNER" && <div className="admin-actions"><Link to="/admin/limits">Upravit interní limity</Link><Link to="/admin/features">Spravovat AI funkce</Link></div>}
  </>}</section>;
}
