import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { readPreferences, savePreferences } from "../features/preferences/data/preferences.js";

export default function SettingsPage() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [fishActivity, setFishActivity] = useState(() => { try { return localStorage.getItem("fishActivityEnabled") === "true"; } catch { return false; } });
  const [error, setError] = useState("");
  const update = (patch) => { try { setPreferences(savePreferences(patch)); setError(""); } catch (saveError) { setError(saveError.message); } };
  return <Layout><section className="add-catch-section">
    <Link to="/profile">← Profil</Link><h1>Nastavení</h1><p>Volby se ukládají pouze v tomto prohlížeči.</p>
    <label>Výchozí režim zápisu<select value={preferences.detailMode} onChange={(event) => update({ detailMode: event.target.value })}><option value="simple">Rychlý zápis</option><option value="detailed">Podrobný zápis</option></select></label>
    <label style={{ display: "flex", gap: ".75rem", alignItems: "center", margin: ".8rem 0" }}><input type="checkbox" checked={fishActivity} onChange={(event) => { try { localStorage.setItem("fishActivityEnabled", String(event.target.checked)); setFishActivity(event.target.checked); window.dispatchEvent(new Event("chytnu:fish-activity-preference")); setError(""); } catch (saveError) { setError(saveError.message || "Preferenci se nepodařilo uložit."); } }} />Povolit rybí aktivitu na domovské stránce</label>
    <p><Link to="/privacy">Soukromí a viditelnost →</Link></p><p><Link to="/notifications">Preference upozornění →</Link></p>
    <p>Zálohu a obnovu místního deníku najdeš na stránce <Link to="/profile">Profil</Link>.</p>
    {error && <p role="alert">{error}</p>}
  </section></Layout>;
}
