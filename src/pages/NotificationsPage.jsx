import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useNotifications } from "../features/notifications/context/notificationContextValue.js";
import { normalizeNotificationDeepLink } from "../features/notifications/data/notificationModel.js";
import { readPreferences, savePreferences } from "../features/preferences/data/preferences.js";
import { getNotificationAdapter } from "../platform/notifications/index.js";
import { NOTIFICATION_PREFERENCES, NOTIFICATION_TYPE_PRESENTATION } from "../product/config/notifications.js";
import Layout from "../shared/layout/Layout";
import "./NotificationsPage.css";

const TYPE_ICONS = Object.freeze(Object.fromEntries(Object.entries(NOTIFICATION_TYPE_PRESENTATION).map(([key, value]) => [key, value.icon])));

function formatNotificationDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "";
}

function initialPushState() {
  try {
    const adapter = getNotificationAdapter();
    return { support: adapter.support(), permission: adapter.permission(), subscribed: false, busy: false, error: "" };
  } catch {
    return { support: { available: false, reason: "Oznámení na zařízení nejsou v tomto prostředí dostupná." }, permission: "default", subscribed: false, busy: false, error: "" };
  }
}

export default function NotificationsPage() {
  const scope = useDataScope();
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, error: inboxError, markAsRead, markAllAsRead } = useNotifications();
  const [preferenceOverride, setPreferenceOverride] = useState({ scopeKey: null, value: null });
  const [preferenceError, setPreferenceError] = useState("");
  const [pushState, setPushState] = useState(initialPushState);
  const preferences = preferenceOverride.value && preferenceOverride.scopeKey === scope.scopeKey
    ? preferenceOverride.value
    : readPreferences(globalThis.localStorage, scope.scopeKey);

  useEffect(() => {
    let active = true;
    try {
      const notificationAdapter = getNotificationAdapter();
      const support = notificationAdapter.support();
      if (support.available && scope.ownerId) {
        notificationAdapter.currentSubscription().then((subscription) => {
          if (!active) return;
          setPushState((previous) => ({ ...previous, subscribed: Boolean(subscription) }));
          if (subscription) void notificationAdapter.refresh().catch(() => {});
        }).catch(() => {});
      }
    } catch { /* The initial UI already reports unavailable support. */ }
    return () => { active = false; };
  }, [scope.ownerId]);

  async function toggleWebPush() {
    setPushState((previous) => ({ ...previous, busy: true, error: "" }));
    try {
      const notificationAdapter = getNotificationAdapter();
      if (pushState.subscribed) await notificationAdapter.unsubscribe();
      else await notificationAdapter.subscribe();
      setPushState((previous) => ({ ...previous, permission: notificationAdapter.permission(), subscribed: !previous.subscribed, busy: false, error: "" }));
    } catch {
      setPushState((previous) => ({ ...previous, permission: getNotificationAdapter().permission(), busy: false, error: "Oznámení se nepodařilo nastavit. Zkus to znovu." }));
    }
  }

  function toggle(key, checked) {
    if (scope.status !== "ready") return;
    try {
      const value = savePreferences({ notifications: { [key]: checked } }, globalThis.localStorage, scope.scopeKey);
      setPreferenceOverride({ scopeKey: scope.scopeKey, value });
      setPreferenceError("");
    } catch (saveError) {
      setPreferenceError(saveError.message);
    }
  }

  async function openNotification(notification) {
    const destination = normalizeNotificationDeepLink(notification.deepLink) ?? "/notifications";
    if (!notification.readAt) await markAsRead(notification.id).catch(() => {});
    navigate(destination);
  }

  async function markAll() {
    try { await markAllAsRead(); } catch { /* Inbox keeps locally saved state and reports load errors separately. */ }
  }

  return (
    <Layout>
      <section className="notifications-page">
        <header className="notifications-header">
          <Link to="/profile">← Profil</Link>
          <div className="notifications-heading-row">
            <div>
              <h1>Oznámení</h1>
              <p>Nové události a důležité informace k tvému rybářskému deníku.</p>
            </div>
            {unreadCount > 0 && <button type="button" className="notifications-mark-all" onClick={markAll}>Označit vše jako přečtené</button>}
          </div>
        </header>

        {inboxError && <p className="notifications-error" role="alert">{inboxError}</p>}
        {loading ? <p className="notifications-inbox-status" role="status" aria-live="polite">Načítám oznámení…</p>
          : notifications.length === 0 ? <div className="notifications-empty">
            <span className="notifications-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></span>
            <strong>Zatím tu nic není</strong>
            <p>Úspěchy, dokončené výzvy a důležité události se zobrazí právě tady.</p>
          </div> : <div className="notification-inbox-list" aria-label="Seznam oznámení">
            {notifications.map((notification) => <article className={`notification-inbox-item${notification.readAt ? " notification-inbox-item-read" : " notification-inbox-item-unread"}`} key={notification.id}>
              <button className="notification-inbox-open" type="button" onClick={() => void openNotification(notification)}>
                <span className="notification-inbox-icon" aria-hidden="true">{TYPE_ICONS[notification.type] ?? "•"}</span>
                <span className="notification-inbox-copy">
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                  <time dateTime={notification.createdAt}>{formatNotificationDate(notification.createdAt)} · {notification.readAt ? "Přečteno" : "Nepřečteno"}</time>
                </span>
                {!notification.readAt && <span className="notification-unread-dot" aria-label="Nepřečtené" />}
              </button>
              {!notification.readAt && <button type="button" className="notification-mark-read" onClick={() => void markAsRead(notification.id).catch(() => {})}>Označit jako přečtené</button>}
            </article>)}
          </div>}

        <details className="notifications-preferences" id="preferences">
          <summary>Preference oznámení</summary>
          <p className="notifications-preferences-intro">Ukládají se pro tento profil a vyjadřují zájem o jednotlivá témata.</p>
          <div className="notifications-list" aria-label="Preference oznámení">
            {NOTIFICATION_PREFERENCES.map((option) => (
              <label className="notification-option" key={option.key}>
                <span className="notification-copy"><strong>{option.title}</strong><small>{option.description}</small></span>
                <input type="checkbox" role="switch" checked={Boolean(preferences.notifications[option.key])}
                  disabled={scope.status !== "ready"} onChange={(event) => toggle(option.key, event.target.checked)} />
              </label>
            ))}
          </div>
          {preferenceError && <p className="notifications-error" role="alert">{preferenceError}</p>}
        </details>
        <section className="web-push-settings" aria-labelledby="web-push-title">
            <div>
              <strong id="web-push-title">Push oznámení</strong>
              <p>{pushState.subscribed ? "Push oznámení jsou pro tento účet zapnutá." : pushState.support?.available ? "Doručení upozornění i mimo otevřenou aplikaci." : pushState.support?.reason || "Kontroluji podporu prohlížeče…"}</p>
            </div>
            {scope.ownerId && <button type="button" className="web-push-toggle" onClick={() => void toggleWebPush()} disabled={pushState.busy || pushState.permission === "denied" || !pushState.support?.available}>
              {pushState.busy ? "Nastavuji…" : pushState.subscribed ? "Vypnout oznámení" : "Zapnout oznámení"}
            </button>}
            {scope.ownerId && !pushState.support?.available && pushState.support?.reason && <p className="web-push-unavailable">{pushState.support.reason}</p>}
            {!scope.ownerId && <p className="web-push-unavailable">Push oznámení vyžadují přihlášený účet.</p>}
            {pushState.permission === "denied" && <p className="web-push-unavailable">Oznámení jsou zakázaná v nastavení prohlížeče.</p>}
            {pushState.error && <p className="notifications-error" role="alert">{pushState.error}</p>}
        </section>
        <p className="notifications-preferences-note">Oprávnění se vyžádá pouze po stisknutí tlačítka Zapnout oznámení.</p>
      </section>
    </Layout>
  );
}
