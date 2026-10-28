import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWebPushManager, getWebPushSupport } from "./webPush.js";

const productionConfig = { mode: "production" };

test("Web Push feature detection supports iOS Home Screen apps and explains browser constraints", () => {
  const ios = { userAgent: "Mozilla/5.0 (iPhone)", serviceWorker: {}, standalone: true };
  const windowValue = { isSecureContext: true, PushManager: {}, Notification: {}, matchMedia: () => ({ matches: false }) };
  assert.equal(getWebPushSupport({ navigatorValue: ios, windowValue, config: productionConfig, publicKey: "public" }).available, true);
  const browserTab = getWebPushSupport({ navigatorValue: { ...ios, standalone: false }, windowValue, config: productionConfig, publicKey: "public" });
  assert.equal(browserTab.available, false);
  assert.match(browserTab.reason, /přidej ChytnuCz na plochu/);
  assert.equal(getWebPushSupport({ navigatorValue: {}, windowValue: {}, config: productionConfig, publicKey: "" }).available, false);
});

test("Web Push requests permission only when subscribe is explicitly called and saves owner-scoped subscription", async () => {
  const calls = [];
  let permissionCalls = 0;
  const subscription = { endpoint: "https://push.example/id", toJSON: () => ({ endpoint: "https://push.example/id", expirationTime: null, keys: { p256dh: "p256dh", auth: "auth" } }), unsubscribe: async () => true };
  const manager = createWebPushManager({
    navigatorValue: { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => null, subscribe: async () => subscription } }) } },
    windowValue: { isSecureContext: true, PushManager: {}, Notification: {} },
    NotificationValue: { permission: "default", requestPermission: async () => { permissionCalls += 1; return "granted"; } },
    config: productionConfig,
    publicKey: "AQID",
    currentOwnerId: () => "owner-a",
    store: { save: async (...args) => calls.push(args), remove: async () => {}, removeExpired: async () => {} },
  });
  assert.equal(permissionCalls, 0);
  assert.equal(manager.permission(), "default");
  await manager.subscribe();
  assert.equal(permissionCalls, 1);
  assert.equal(calls[0][0], "owner-a");
  assert.equal(calls[0][1].endpoint, subscription.endpoint);
});

test("existing browser subscription is refreshed and unsubscribe removes its owner-scoped record", async () => {
  const calls = [];
  const subscription = { endpoint: "https://push.example/rotated", toJSON: () => ({ endpoint: "https://push.example/rotated", keys: { p256dh: "p", auth: "a" } }), unsubscribe: async () => true };
  const manager = createWebPushManager({
    navigatorValue: { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => subscription } }) } },
    windowValue: {}, NotificationValue: { permission: "granted" }, config: productionConfig, publicKey: "AQID",
    currentOwnerId: () => "owner-b",
    store: { save: async (...args) => calls.push(["save", ...args]), remove: async (...args) => calls.push(["remove", ...args]), removeExpired: async () => {} },
  });
  assert.equal(await manager.currentSubscription(), subscription);
  await manager.refresh();
  await manager.unsubscribe();
  assert.equal(calls[0][1], "owner-b");
  assert.deepEqual(calls[1], ["remove", "owner-b", subscription.endpoint]);
});

test("subscription service refuses unauthenticated owner state", async () => {
  const manager = createWebPushManager({ currentOwnerId: () => null, config: productionConfig });
  await assert.rejects(manager.subscribe(), /přihlas ke svému účtu/);
});

test("generated offline service worker handles push clicks while leaving non-GET photo requests untouched", async () => {
  const source = await readFile(new URL("../../../../vite.config.js", import.meta.url), "utf8");
  assert.match(source, /request\.method !== 'GET'.*return/);
  assert.match(source, /addEventListener\('push'/);
  assert.match(source, /addEventListener\('notificationclick'/);
  assert.match(source, /self\.clients\.openWindow\(target\)/);
});
