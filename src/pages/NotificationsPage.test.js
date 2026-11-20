import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Home offers a bell inbox with unread count while Profile remains in primary navigation", async () => {
  const [home, layout] = await Promise.all([
    readFile(new URL("./HomePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../shared/layout/Layout.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /to="\/notifications" aria-label=\{unreadCount \? `Oznámení/);
  assert.match(home, /dashboard-notification-badge/);
  assert.match(home, /useNotifications\(\)/);
  assert.match(layout, /to="\/profile" className=\{itemClass\(profileActive\)\}/);
  assert.match(layout, /navigationSection\(pathname\)/);
  assert.match(layout, /to="\/journal" className=\{itemClass\(journalActive\)\}/);
});

test("Notification Center exposes read actions, deep links, empty state and retained preferences", async () => {
  const source = await readFile(new URL("./NotificationsPage.jsx", import.meta.url), "utf8");
  assert.match(source, /Označit vše jako přečtené/);
  assert.match(source, /notification\.readAt/);
  assert.match(source, /normalizeNotificationDeepLink\(notification\.deepLink\)/);
  assert.match(source, /Zatím tu nic není/);
  assert.match(source, /details className="notifications-preferences"/);
  assert.doesNotMatch(source, /Notification permission|requestPermission/);
  assert.match(source, /Push doručování zatím není aktivní/);
  assert.match(source, /!pushState\.subscribed/);
  assert.match(source, /notificationAdapter\.subscribe\(\)/);
  assert.match(source, /Sociální události/);
  assert.match(source, /SOCIAL_NOTIFICATION_PREFERENCES\.map/);
  assert.match(source, /notificationRepository\.saveSocialPreferences/);
  assert.match(source, /socialPreferenceState\.loadError/);
});
