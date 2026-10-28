import { isNativePlatform } from "../platform.js";
import { webPushManager } from "../../features/notifications/data/webPush.js";

export function getNotificationAdapter() {
  const native = isNativePlatform();
  if (!native) {
    return Object.freeze({
      platform: "web",
      supported: Boolean(globalThis.Notification),
      permission: () => webPushManager.permission(),
      support: () => webPushManager.support(),
      currentSubscription: () => webPushManager.currentSubscription(),
      subscribe: () => webPushManager.subscribe(),
      unsubscribe: () => webPushManager.unsubscribe(),
      refresh: () => webPushManager.refresh(),
    });
  }
  return Object.freeze({
    platform: "native",
    supported: false,
    permission: () => "unavailable",
    support: () => ({ supported: false, available: false, reason: "Nativní oznámení zatím nejsou napojená." }),
    currentSubscription: async () => null,
    subscribe: async () => { throw new Error("Nativní oznámení zatím nejsou napojená."); },
    unsubscribe: async () => false,
    refresh: async () => null,
  });
}
