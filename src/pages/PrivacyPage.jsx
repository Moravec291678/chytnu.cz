import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { applyOnboardingLocationMode } from "../features/privacy/data/onboardingLocationPreference.js";
import { DEFAULT_PRIVACY_SETTINGS, HEATMAP_GRANULARITY } from "../features/privacy/data/privacyModel.js";
import { privacyRepository } from "../features/privacy/data/privacyRepository.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import "./PrivacyPage.css";

const GPS_OPTIONS = [
  { value: "exact", label: "Přesně" },
  { value: "approximate", label: "Přibližně" },
  { value: "none", label: "Bez GPS" },
];

const HEATMAP_OPTIONS = [
  { value: HEATMAP_GRANULARITY.CITY, label: "Město" },
  { value: HEATMAP_GRANULARITY.AREA, label: "Oblast" },
  { value: HEATMAP_GRANULARITY.OFF, label: "Vypnuto" },
];

function SegmentedOptions({ label, value, options, onChange, disabled }) {
  return <div className="privacy-segmented" role="group" aria-label={label}>
    {options.map((option) => <button
      key={option.value}
      type="button"
      aria-pressed={value === option.value}
      className={value === option.value ? "privacy-segment privacy-segment-active" : "privacy-segment"}
      disabled={disabled}
      onClick={() => onChange(option.value)}
    >{option.label}</button>)}
  </div>;
}

export default function PrivacyPage() {
  const scope = useDataScope();
  const { state: catchState } = useCatches();
  const [settings, setSettings] = useState(DEFAULT_PRIVACY_SETTINGS);
  const [status, setStatus] = useState("loading");
  const [loadedScopeKey, setLoadedScopeKey] = useState(null);
  const [message, setMessage] = useState("");
  const [waters, setWaters] = useState({ scopeKey: null, records: [], status: "loading" });

  useEffect(() => {
    let active = true;
    if (scope.status !== "ready") return () => { active = false; };
    const scopeKey = scope.scopeKey;
    privacyRepository.get(scope).then((value) => {
      if (active) {
        setSettings(value);
        setLoadedScopeKey(scopeKey);
        setStatus("ready");
      }
    }).catch(() => {
      if (active) {
        setLoadedScopeKey(scopeKey);
        setStatus("load-error");
      }
    });
    return () => { active = false; };
  }, [scope]);

  useEffect(() => {
    let active = true;
    if (scope.status !== "ready") return () => { active = false; };
    const scopeKey = scope.scopeKey;
    waterRepository.list(scope).then((records) => {
      if (active) setWaters({ scopeKey, records, status: "ready" });
    }).catch(() => {
      if (active) setWaters({ scopeKey, records: [], status: "error" });
    });
    return () => { active = false; };
  }, [scope]);

  const readyForScope = scope.status === "ready" && loadedScopeKey === scope.scopeKey && status !== "loading";
  const disabled = !readyForScope || status === "load-error" || status === "saving";
  const currentSettings = loadedScopeKey === scope.scopeKey && status !== "load-error"
    ? settings
    : DEFAULT_PRIVACY_SETTINGS;

  const save = async (patch) => {
    if (disabled) return;
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    setStatus("saving");
    setMessage("");
    try {
      const persisted = await privacyRepository.put(next, scope);
      setSettings(persisted);
      setStatus("ready");
      setMessage("Volba se uložila pro tento profil.");
    } catch {
      setSettings(previous);
      setStatus("ready");
      setMessage("Volbu se nepodařilo uložit. Zkontroluj připojení k místnímu úložišti a zkus to znovu.");
    }
  };

  const privatePlaces = useMemo(() => {
    if (waters.scopeKey !== scope.scopeKey) return [];
    const items = new Map();
    for (const water of waters.records) {
      if (water?.id && water?.name?.trim()) items.set(`water:${water.id}`, { key: `water:${water.id}`, name: water.name.trim(), detail: [water.type, water.waterNumber].filter(Boolean).join(" · ") || "Uložený revír" });
    }
    if (catchState.loading) return [...items.values()];
    for (const record of catchState.catches) {
      const name = record?.locationName?.trim();
      if (!name || record?.privacy?.privateSpot !== true) continue;
      const key = record.waterId ? `water:${record.waterId}` : `spot:${name.toLocaleLowerCase("cs-CZ")}`;
      if (!items.has(key)) items.set(key, { key, name, detail: "Soukromé místo z deníku" });
    }
    return [...items.values()];
  }, [catchState.catches, catchState.loading, scope.scopeKey, waters]);

  const currentGpsMode = currentSettings.privateSpotDefault ? "none" : currentSettings.defaultLocationPrecision;

  return <Layout>
    <main className="privacy-page">
      <header className="privacy-header">
        <Link className="privacy-back" to="/profile" aria-label="Zpět na profil">‹</Link>
        <div><h1>Soukromí a poloha</h1><p>Ty rozhoduješ, co zůstane jen u tebe.</p></div>
      </header>

      <section className="privacy-card" aria-labelledby="privacy-gps-title">
        <div className="privacy-section-heading"><span className="privacy-icon" aria-hidden="true">⌖</span><div><h2 id="privacy-gps-title">GPS při záznamu</h2><p>Výchozí režim pro nová místa</p></div></div>
        <SegmentedOptions label="Přesnost GPS při záznamu" value={currentGpsMode} options={GPS_OPTIONS} disabled={disabled} onChange={(mode) => save(applyOnboardingLocationMode(currentSettings, mode))} />
        <p className="privacy-hint">Přesná poloha se uloží do soukromého deníku. Přibližná volba se při případném veřejném zobrazení anonymizuje. Přesné GPS se nikdy neposílá jako veřejná souřadnice.</p>
      </section>

      <section className="privacy-card" aria-labelledby="privacy-visibility-title">
        <div className="privacy-section-heading"><span className="privacy-icon" aria-hidden="true">◉</span><div><h2 id="privacy-visibility-title">Viditelnost</h2><p>Uložené volby, bez aktivního zveřejnění</p></div></div>
        <label className="privacy-toggle-row">
          <span><strong>Veřejný profil</strong><small>Volba se ukládá pro tento profil.</small></span>
          <input type="checkbox" role="switch" checked={currentSettings.profileVisibility === "public"} disabled={disabled} onChange={(event) => save({ profileVisibility: event.target.checked ? "public" : "private" })} />
        </label>
        <p className="privacy-hint privacy-backend-note">Veřejné profily zatím nejsou aktivní. Tato volba nic nezveřejňuje ani neposílá na server.</p>
        <div className="privacy-toggle-row privacy-heatmap-heading">
          <span><strong>Moje úlovky v heatmapě</strong><small>Preference se uloží jen pro tento profil.</small></span>
          <input type="checkbox" aria-label="Zahrnout úlovky do heatmapy podle zvolené granularity" checked={currentSettings.heatmapGranularity !== HEATMAP_GRANULARITY.OFF} disabled={disabled} onChange={(event) => save({ heatmapGranularity: event.target.checked ? HEATMAP_GRANULARITY.AREA : HEATMAP_GRANULARITY.OFF })} />
        </div>
        <SegmentedOptions label="Granularita heatmapy" value={currentSettings.heatmapGranularity} options={HEATMAP_OPTIONS} disabled={disabled} onChange={(granularity) => save({ heatmapGranularity: granularity })} />
        <p className="privacy-hint privacy-backend-note">Veřejná agregační heatmapa není dostupná. Uložená preference zatím žádná data nesdílí.</p>
      </section>

      <section className="privacy-card privacy-places-card" aria-labelledby="privacy-places-title">
        <div className="privacy-section-heading"><span className="privacy-icon" aria-hidden="true">⌖</span><div><h2 id="privacy-places-title">Soukromé lokace</h2><p>Pouze uložená místa z aktivního profilu</p></div></div>
        {!readyForScope || waters.scopeKey !== scope.scopeKey || waters.status === "loading" || catchState.loading
          ? <p className="privacy-empty" role="status">Načítám uložená místa…</p>
          : waters.status === "error"
            ? <p className="privacy-empty" role="alert">Uložená místa se nepodařilo načíst.</p>
            : privatePlaces.length
              ? <ul className="privacy-place-list">{privatePlaces.map((place) => <li key={place.key}><span className="privacy-place-pin" aria-hidden="true">⌖</span><span><strong>{place.name}</strong><small>{place.detail}</small></span><span className="privacy-lock" aria-label="Soukromé">🔒</span></li>)}</ul>
              : <p className="privacy-empty">V tomto profilu zatím nejsou uložené žádné lokace.</p>}
      </section>

      {status === "load-error" && <p className="privacy-error" role="alert">Nastavení soukromí se nepodařilo načíst.</p>}
      {status === "saving" && <p className="privacy-feedback" role="status">Ukládám nastavení…</p>}
      {message && <p className={message.startsWith("Volbu se nepodařilo") ? "privacy-error" : "privacy-feedback"} role="status">{message}</p>}
    </main>
  </Layout>;
}
