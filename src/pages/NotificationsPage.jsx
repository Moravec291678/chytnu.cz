import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { readPreferences, savePreferences } from "../features/preferences/data/preferences.js";

const OPTIONS = [["fishActivity", "Rybí aktivita"], ["challenges", "Výzvy"], ["streak", "Týdenní série"], ["weeklySummary", "Týdenní souhrn"], ["weather", "Počasí"]];
export default function NotificationsPage() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [error, setError] = useState("");
  const toggle = (key, checked) => { try { setPreferences(savePreferences({ notifications: { [key]: checked } })); setError(""); } catch (saveError) { setError(saveError.message); } };
  return <Layout><section className="add-catch-section"><Link to="/settings">← Nastavení</Link><h1>Upozornění</h1>
    <p>Tyto volby jsou místní preference. Aplikace zatím neposílá push upozornění.</p>
    {OPTIONS.map(([key, label]) => <label key={key} style={{ display: "flex", gap: ".75rem", alignItems: "center", margin: ".8rem 0" }}><input type="checkbox" checked={Boolean(preferences.notifications[key])} onChange={(event) => toggle(key, event.target.checked)} />{label}</label>)}
    {error && <p role="alert">{error}</p>}
  </section></Layout>;
}
