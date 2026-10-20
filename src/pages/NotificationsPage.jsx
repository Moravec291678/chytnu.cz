import { useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { readPreferences, savePreferences } from "../features/preferences/data/preferences.js";
import { isFeatureEnabled } from "../shared/config/featureFlags.js";
import Layout from "../shared/layout/Layout";
import "./NotificationsPage.css";

const OPTIONS = [
  { key: "morningFishActivity", title: "Ranní aktivita ryb", description: "Ranní přehled odhadu vhodnosti podmínek pro rybaření." },
  { key: "tomorrowGreatConditions", title: "Skvělé podmínky zítra", description: "Preference upozornění, když předpověď ukáže výrazně vhodné podmínky." },
  { key: "friendActivity", title: "Aktivita přátel", description: "Preference pro nové úlovky a aktivitu přátel." },
  { key: "streaksAndChallenges", title: "Série a výzvy", description: "Připomenutí série a průběhu osobních výzev." },
  { key: "friendLegendaryCatch", title: "Legendary úlovek přítele", description: "Preference pro výjimečný úlovek přítele." },
];

export default function NotificationsPage() {
  const scope = useDataScope();
  const [preferenceOverride, setPreferenceOverride] = useState({ scopeKey: null, value: null });
  const [error, setError] = useState("");
  const preferences = preferenceOverride.value && preferenceOverride.scopeKey === scope.scopeKey
    ? preferenceOverride.value
    : readPreferences(globalThis.localStorage, scope.scopeKey);
  const pushDeliveryAvailable = isFeatureEnabled("notifications");

  function toggle(key, checked) {
    if (scope.status !== "ready") return;
    try {
      const value = savePreferences(
        { notifications: { [key]: checked } },
        globalThis.localStorage,
        scope.scopeKey,
      );
      setPreferenceOverride({ scopeKey: scope.scopeKey, value });
      setError("");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <Layout>
      <section className="notifications-page">
        <header className="notifications-header">
          <Link to="/settings">← Nastavení</Link>
          <h1>Oznámení</h1>
          <p>Vyber si témata, o kterých chceš být informován.</p>
        </header>

        <div className="notifications-status-grid" aria-label="Stav oznámení">
          <article className="notifications-status-card">
            <span>PREFERENCE</span>
            <strong>Ukládají se pro tento profil</strong>
            <p>Přepínače určují, o jaké typy oznámení máš zájem.</p>
          </article>
          <article className="notifications-status-card notifications-delivery-card">
            <span>PUSH DELIVERY</span>
            <strong>{pushDeliveryAvailable ? "Povoleno pro toto prostředí" : "Push backend není aktivní"}</strong>
            <p>
              {pushDeliveryAvailable
                ? "Doručení stále závisí na oprávnění zařízení a dostupnosti služby."
                : "Zapnutí preference samo o sobě nezačne posílat oznámení do zařízení."}
            </p>
          </article>
        </div>

        <div className="notifications-list" aria-label="Preference oznámení">
          {OPTIONS.map((option) => (
            <label className="notification-option" key={option.key}>
              <span className="notification-copy">
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={Boolean(preferences.notifications[option.key])}
                disabled={scope.status !== "ready"}
                onChange={(event) => toggle(option.key, event.target.checked)}
              />
            </label>
          ))}
        </div>

        <p className="notifications-rule">
          Pokud bude doručování aktivováno, produktové pravidlo je nejvýše 1–2 oznámení denně.
        </p>
        {error && <p className="notifications-error" role="alert">{error}</p>}
      </section>
    </Layout>
  );
}
