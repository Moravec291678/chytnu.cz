import { useRef, useEffect, useState } from "react";
import { socialRequest } from "../data/socialClient.js";
import "./publicProgression.css";

const integer = value => Number.isSafeInteger(value) && value >= 0;
const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const format = value => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(value);
const categoryIcons = { Úlovky: "🎣", Druhy: "🐟", Explorace: "⌖", Sezóny: "☀", Série: "✓", Skryté: "★" };
const dateLabel = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(new Date(value)) : null;
const awards = value => (Array.isArray(value) ? value : []).filter(item => item && item.unlocked !== false && item.isCompleted !== false);

export function PublicProgressionSummary({ progression }) {
  if (!progression || progression.source !== "server" || progression.verified === false || !integer(progression.level) || progression.level < 1) return null;
  return <div className="public-progression-summary">
    <div><strong>Úroveň {progression.level}</strong>{progression.rank && <span>{progression.rank}</span>}</div>
    {integer(progression.xp) && <p><b>{format(progression.xp)} XP</b> ze serverem potvrzených událostí</p>}
    <p className="social-help">Potvrzený postup se může lišit od místního deníku a historicky importovaných odměn.</p>
  </div>;
}

export function PublicAchievements({ achievements, progression }) {
  const [category, setCategory] = useState("");
  const items = awards(achievements), categories = [...new Set(items.map(item => item.category).filter(Boolean))];
  const activeCategory = categories.includes(category) ? category : "";
  const shown = activeCategory ? items.filter(item => item.category === activeCategory) : items;
  return <>
    <h2>Rybářské úspěchy</h2><PublicProgressionSummary progression={progression} />
    {items.length > 0 ? <>
      <p className="social-help">Výslovně vybrané splněné úspěchy. Sdílení nepřipisuje žádné další XP.</p>
      {categories.length > 1 && <nav className="social-tabs" aria-label="Kategorie sdílených úspěchů"><button type="button" aria-pressed={!activeCategory} onClick={() => setCategory("")}>Všechny</button>{categories.map(value => <button key={value} type="button" aria-pressed={activeCategory === value} onClick={() => setCategory(value)}>{value}</button>)}</nav>}
      <div className="public-achievement-grid">{shown.map(item => {
        const verified = item.source === "server" && item.verified !== false, unlocked = verified ? dateLabel(item.unlockedAt) : null;
        return <article className={`public-achievement${verified ? " public-achievement--verified" : ""}`} key={item.id}>
          <span className="public-achievement-icon" aria-hidden="true">{categoryIcons[item.category] ?? "✓"}</span>
          <div><p className="public-achievement-category">{item.category || "Úspěch"}</p><h3>{item.title || item.label || item.name}</h3>{item.description && <p>{item.description}</p>}
            <p className="public-achievement-status">{verified ? "Splněno · potvrzeno serverem" : "Nahlášený úspěch · server neověřil"}{unlocked ? ` · ${unlocked}` : ""}</p>
            {integer(item.xp) && <p className="public-achievement-xp">Standardní odměna: {format(item.xp)} XP · vystavení XP nepřidává</p>}
          </div>
        </article>;
      })}</div>
    </> : <p className="social-empty">Pro tento okruh návštěvníků nejsou zveřejněné žádné splněné úspěchy. Skryté a soukromé odměny se nezobrazují.</p>}
  </>;
}

export function PublicStatistics({ statistics }) {
  if (!statistics) return null;
  const metrics = [["catchCount", "Úlovků", ""], ["speciesCount", "Druhů", ""], ["longestCm", "Nejdelší úlovek", " cm"], ["heaviestKg", "Nejtěžší měřený úlovek", " kg"]].filter(([key]) => number(statistics[key]));
  return <section aria-label="Sdílené statistiky">
    <p className="social-help">Pouze z výslovně sdílených a právě dostupných úlovků{statistics.partial ? " · výběr z omezené části záznamů" : ""}. Nejde o úplný soukromý deník ani ověření rybářské výkonnosti.</p>
    <div className="social-stat-grid public-stat-grid">{metrics.map(([key, label, unit]) => <div key={key}><strong>{format(statistics[key])}{unit}</strong><span>{label}</span></div>)}</div>
    {statistics.speciesCounts?.length > 0 && <details className="public-species-summary"><summary>Druhy ve sdíleném výběru</summary><ul>{statistics.speciesCounts.map(item => <li key={item.species}><span>{item.species}</span><strong>{integer(item.count) ? format(item.count) : "—"}</strong></li>)}</ul></details>}
  </section>;
}

export function PublicTrophies({ trophies }) {
  return <><h2>Trofejní vitrína</h2><p className="social-help">Největší z povolených sdílených záznamů. Přesné lokality ani soukromý deník se neotevírají.</p>
    {trophies?.length ? <div className="public-trophy-grid">{trophies.map(item => <article className="public-trophy" key={item.id}><span aria-hidden="true">🏆</span><h3>{item.species || item.label || "Sdílený úlovek"}</h3><p>{number(item.lengthCm) && item.lengthCm > 0 ? `${format(item.lengthCm)} cm` : ""}{number(item.weightKg) && item.weightKg > 0 ? `${item.lengthCm > 0 ? " · " : ""}${format(item.weightKg)} kg` : ""}</p>{item.caughtAt && <p className="social-help">{item.caughtAt.length === 7 ? item.caughtAt : dateLabel(item.caughtAt)}</p>}</article>)}</div> : <p className="social-empty">Zatím žádné sdílené trofejní záznamy pro tento okruh návštěvníků.</p>}
  </>;
}

/** Mounted only for a server-confirmed friendship; the endpoint independently enforces it. */
export function FriendProgressionComparison({ viewerUid, targetUid, refreshKey }) {
  const key = `${viewerUid}:${targetUid}:${refreshKey}`;
  const [result, setResult] = useState(null), [busy, setBusy] = useState(null);
  const controllerRef = useRef(null);
  useEffect(() => () => controllerRef.current?.abort(), [key]);
  async function load() {
    if (busy === key) return;
    const controller = new AbortController(); controllerRef.current = controller; setBusy(key);
    try {
      const value = await socialRequest("progression.compare", { targetUid }, { signal: controller.signal });
      if (!controller.signal.aborted) setResult({ key, profiles: value.profiles });
    } catch (error) { if (!controller.signal.aborted) setResult({ key, error: error.message }); }
    finally { setBusy(old => old === key ? null : old); }
  }
  const current = result?.key === key ? result : null;
  return <details className="friend-progression-comparison"><summary>Porovnat sdílený rybářský postup</summary><p className="social-help">Jen údaje, které oba dovolujete sdílet přátelům. XP jsou potvrzené serverem; vystavené místní úspěchy jsou neověřená hlášení. Méně zveřejněných záznamů neznamená menší úspěšnost.</p><button type="button" disabled={busy === key} onClick={load}>{busy === key ? "Ověřuji oprávnění…" : current ? "Obnovit porovnání" : "Načíst společně sdílené údaje"}</button>
    {current?.error && <p role="alert" className="social-error">{current.error}</p>}
    {current?.profiles && <div className="friend-comparison-grid">{current.profiles.map(profile => <article key={profile.uid}><h3>{profile.displayName}{profile.uid === viewerUid ? " (ty)" : ""}</h3><dl>
      <div><dt>Potvrzená úroveň</dt><dd>{profile.progression?.source === "server" && integer(profile.progression.level) ? profile.progression.level : "Nesdílí"}</dd></div>
      <div><dt>Potvrzené XP</dt><dd>{profile.progression?.source === "server" && integer(profile.progression.xp) ? format(profile.progression.xp) : "Nesdílí"}</dd></div>
      <div><dt>Sdílené úspěchy</dt><dd>{Array.isArray(profile.achievements) ? awards(profile.achievements).length : "Nesdílí"}</dd></div>
      <div><dt>Druhy ve sdíleném výběru</dt><dd>{integer(profile.statistics?.speciesCount) ? profile.statistics.speciesCount : "Nesdílí"}</dd></div>
    </dl></article>)}</div>}
  </details>;
}
