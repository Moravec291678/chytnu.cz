import { getBackendConfiguration } from "../../auth/data/backendConfig.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { webPushSubscriptionStore } from "./webPushSubscriptionStore.js";

const APPLICATION_SERVER_KEY = import.meta.env?.VITE_WEB_PUSH_PUBLIC_KEY;

function decodeVapidKey(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Oznámení na zařízení zatím nejsou připravená.");
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function getWebPushSupport({ navigatorValue = globalThis.navigator, windowValue = globalThis.window, config = getBackendConfiguration(), publicKey = APPLICATION_SERVER_KEY } = {}) {
  const supported = Boolean(windowValue?.isSecureContext && navigatorValue?.serviceWorker && windowValue?.PushManager && windowValue?.Notification);
  const standalone = Boolean(windowValue?.matchMedia?.("(display-mode: standalone)").matches || navigatorValue?.standalone === true);
  const ios = /iphone|ipad|ipod/i.test(navigatorValue?.userAgent ?? "");
  const available = supported && Boolean(publicKey) && config.mode !== "emulator";
  let reason = "";
  if (!supported) reason = ios ? "Na iPhonu a iPadu jsou oznámení dostupná po přidání aplikace na plochu." : "Tento prohlížeč oznámení na zařízení nepodporuje.";
  else if (ios && !standalone) reason = "Na iPhonu přidej ChytnuCz na plochu a otevři ji jako aplikaci.";
  else if (config.mode === "emulator") reason = "Oznámení na zařízení v tomto prostředí nejsou dostupná.";
  else if (!publicKey) reason = "Oznámení na zařízení zatím nejsou připravená.";
  return { supported, standalone, ios, available: available && (!ios || standalone), reason };
}

export function createWebPushManager({
  navigatorValue = globalThis.navigator,
  windowValue = globalThis.window,
  NotificationValue = globalThis.Notification,
  config = getBackendConfiguration,
  publicKey = APPLICATION_SERVER_KEY,
  store = webPushSubscriptionStore,
  currentOwnerId = () => firebaseAuth.currentUserId(),
} = {}) {
  async function ready() {
    const environment = typeof config === "function" ? config() : config;
    const support = getWebPushSupport({ navigatorValue, windowValue, config: environment, publicKey });
    if (!support.available) throw new Error(support.reason || "Oznámení na zařízení nejsou dostupná.");
    const registration = await navigatorValue.serviceWorker.ready;
      if (!registration.pushManager) throw new Error("Tento prohlížeč oznámení na zařízení nepodporuje.");
    return registration;
  }

  return Object.freeze({
    support() { return getWebPushSupport({ navigatorValue, windowValue, config: typeof config === "function" ? config() : config, publicKey }); },
    permission() { return NotificationValue?.permission ?? "unsupported"; },
    async currentSubscription() {
      const registration = await navigatorValue?.serviceWorker?.ready;
      return registration?.pushManager?.getSubscription() ?? null;
    },
    async subscribe() {
      const ownerId = currentOwnerId();
      if (!ownerId) throw new Error("Pro zapnutí Web Push se přihlas ke svému účtu.");
      const environment = typeof config === "function" ? config() : config;
      const support = getWebPushSupport({ navigatorValue, windowValue, config: environment, publicKey });
      if (!support.available) throw new Error(support.reason || "Oznámení na zařízení nejsou dostupná.");
      const permission = await NotificationValue.requestPermission();
      if (permission !== "granted") throw new Error(permission === "denied" ? "Oznámení jsou v nastavení prohlížeče zakázaná." : "Oprávnění k oznámením nebylo uděleno.");
      const registration = await ready();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) });
      await store.save(ownerId, subscription.toJSON());
      return subscription;
    },
    async unsubscribe() {
      const ownerId = currentOwnerId();
      if (!ownerId) throw new Error("Pro správu Web Push se přihlas ke svému účtu.");
      const registration = await navigatorValue.serviceWorker.ready;
      const subscription = await registration.pushManager?.getSubscription();
      if (subscription) {
        await store.remove(ownerId, subscription.endpoint);
        await subscription.unsubscribe();
      } else {
        await store.removeExpired(ownerId);
      }
      return true;
    },
    async refresh() {
      const ownerId = currentOwnerId();
      if (!ownerId) return null;
      const registration = await navigatorValue.serviceWorker?.ready;
      const subscription = await registration?.pushManager?.getSubscription();
      if (!subscription) {
        await store.removeExpired(ownerId);
        return null;
      }
      await store.save(ownerId, subscription.toJSON());
      return subscription;
    },
  });
}

export const webPushManager = createWebPushManager();
