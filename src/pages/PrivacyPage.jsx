import { useEffect, useState } from "react";
import Layout from "../shared/layout/Layout";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { DEFAULT_PRIVACY_SETTINGS } from "../features/privacy/data/privacyModel.js";
import { privacyRepository } from "../features/privacy/data/privacyRepository.js";
import "./ProfilePage.css";

export default function PrivacyPage() {
  const scope = useDataScope();
  const [settings, setSettings] = useState(DEFAULT_PRIVACY_SETTINGS);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (scope.status !== "ready") return () => { active = false; };
    privacyRepository.get(scope).then((value) => {
      if (active) { setSettings(value); setStatus("ready"); }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [scope]);

  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (scope.status !== "ready") return;
    setStatus("saving");
    setMessage("");
    try {
      setSettings(await privacyRepository.put(settings, scope));
      setMessage("Nastavení soukromí bylo uloženo.");
      setStatus("ready");
    } catch {
      setMessage("Nastavení soukromí se nepodařilo uložit.");
      setStatus("error");
    }
  };

  return <Layout><div className="profile-page">
    <header className="profile-header"><h1>Soukromí</h1><p>Ve výchozím stavu zůstává profil, poloha i každý úlovek soukromý.</p></header>
    <section className="profile-panel" aria-labelledby="privacy-profile-title">
      <h2 id="privacy-profile-title">Výchozí sdílení</h2>
      <label className="profile-restore-mode">Viditelnost profilu
        <select value={settings.profileVisibility} onChange={(event) => update("profileVisibility", event.target.value)} disabled={status === "loading" || status === "saving"}>
          <option value="private">Soukromý</option><option value="public">Veřejný</option>
        </select>
      </label>
      <label className="profile-restore-mode">Nové úlovky
        <select value={settings.defaultCatchVisibility} onChange={(event) => update("defaultCatchVisibility", event.target.value)} disabled={status === "loading" || status === "saving"}>
          <option value="private">Soukromé</option><option value="public">Veřejné</option>
        </select>
      </label>
      <label className="profile-restore-mode">Fotografie nových úlovků
        <select value={settings.defaultPhotoVisibility} onChange={(event) => update("defaultPhotoVisibility", event.target.value)} disabled={status === "loading" || status === "saving"}>
          <option value="private">Soukromé</option><option value="public">Veřejné</option>
        </select>
      </label>
      <label className="profile-restore-mode">Výchozí přesnost polohy
        <select value={settings.defaultLocationPrecision} onChange={(event) => update("defaultLocationPrecision", event.target.value)} disabled={settings.privateSpotDefault || status === "loading" || status === "saving"}>
          <option value="none">Nezveřejňovat</option><option value="approximate">Pouze přibližná oblast</option><option value="exact">Přesná poloha</option>
        </select>
      </label>
      <label className="privacy-checkbox-row"><input type="checkbox" checked={settings.privateSpotDefault} onChange={(event) => update("privateSpotDefault", event.target.checked)} /> <span>Nová místa považovat za soukromá</span></label>
      <label className="privacy-checkbox-row"><input type="checkbox" checked={settings.nearbyOptIn} onChange={(event) => update("nearbyOptIn", event.target.checked)} /> <span>Povolit anonymní zahrnutí do funkce Okolí</span></label>
      <label className="privacy-checkbox-row"><input type="checkbox" checked={settings.heatmapOptIn} onChange={(event) => update("heatmapOptIn", event.target.checked)} /> <span>Povolit anonymní zahrnutí do heatmapy</span></label>
      <p className="profile-privacy-note">Soukromé místo vždy skryje polohu a vyloučí záznam z funkcí Okolí a heatmapy. Změna výchozí volby sama nezmění starší úlovky.</p>
      <button className="profile-backup-button" type="button" onClick={save} disabled={scope.status !== "ready" || status === "saving"}>{status === "saving" ? "Ukládám…" : "Uložit nastavení"}</button>
      {message && <p className={status === "error" ? "profile-error" : "profile-feedback"} role="status">{message}</p>}
    </section>
  </div></Layout>;
}
