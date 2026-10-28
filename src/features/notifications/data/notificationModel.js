import { validateDataScope } from "../../auth/data/localDataScope.js";
import { NOTIFICATION_COPY, NOTIFICATION_TYPES } from "../../../product/config/notifications.js";
import { PRODUCT_LIMITS } from "../../../product/config/limits.js";

export { NOTIFICATION_TYPES } from "../../../product/config/notifications.js";

export function normalizeNotificationDeepLink(value) {
  if (typeof value !== "string") return null;
  const link = value.trim();
  if (!link.startsWith("/") || link.startsWith("//") || link.length > PRODUCT_LIMITS.notificationDeepLinkLength
    || !/^\/[A-Za-z0-9/_?=&%#.-]*$/.test(link)) return null;
  return link;
}

export function createNotificationRecord(input, scopeOptions, { now = new Date() } = {}) {
  const scope = validateDataScope(scopeOptions ?? {});
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  const deepLink = normalizeNotificationDeepLink(input?.deepLink);
  const id = typeof input?.id === "string" ? input.id.trim() : `n_${globalThis.crypto?.randomUUID?.() ?? ""}`;
  const createdAt = input?.createdAt ?? now.toISOString();
  if (!id || id.length > PRODUCT_LIMITS.notificationIdLength || !/^[A-Za-z0-9_-]+$/.test(id)) throw new TypeError("Oznámení nemá platné ID.");
  if (!NOTIFICATION_TYPES.includes(input?.type)) throw new TypeError("Oznámení má nepodporovaný typ.");
  if (!title || title.length > PRODUCT_LIMITS.notificationTitleLength) throw new TypeError(`Název oznámení musí mít 1 až ${PRODUCT_LIMITS.notificationTitleLength} znaků.`);
  if (!body || body.length > PRODUCT_LIMITS.notificationBodyLength) throw new TypeError(`Text oznámení musí mít 1 až ${PRODUCT_LIMITS.notificationBodyLength} znaků.`);
  if (!deepLink) throw new TypeError("Oznámení musí odkazovat na bezpečnou stránku aplikace.");
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) throw new TypeError("Oznámení nemá platný čas vytvoření.");
  const readAt = input?.readAt ?? null;
  if (readAt !== null && (typeof readAt !== "string" || !Number.isFinite(Date.parse(readAt)))) {
    throw new TypeError("Oznámení má neplatný čas přečtení.");
  }
  return {
    id,
    type: input.type,
    title,
    body,
    createdAt: new Date(createdAt).toISOString(),
    readAt: readAt ? new Date(readAt).toISOString() : null,
    deepLink,
    scopeKey: scope.scopeKey,
    ownerId: scope.ownerId,
  };
}

export function stableNotificationId(...parts) {
  return `n_${parts.map((part) => String(part ?? "")).join("_").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, PRODUCT_LIMITS.notificationIdLength - 2)}`;
}

export function sortNotificationsNewestFirst(notifications) {
  return [...notifications].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    || left.id.localeCompare(right.id));
}

export function mergeNotificationReadState(local, remote) {
  return {
    ...remote,
    readAt: local?.readAt ?? remote.readAt ?? null,
  };
}

export function progressionNotificationInput(event, scopeKey) {
  if (event?.type === "achievement.unlocked") {
    const copy = NOTIFICATION_COPY.achievement;
    return {
      id: stableNotificationId("achievement", scopeKey, event.id),
      type: "achievement",
      title: copy.title,
      body: event.xp > 0 ? copy.bodyWithXp.replace("{xp}", String(event.xp)) : copy.bodyWithoutXp,
      createdAt: event.createdAt,
      deepLink: copy.deepLink,
    };
  }
  if (event?.type === "challenge.completed") {
    const copy = NOTIFICATION_COPY.challenge;
    return {
      id: stableNotificationId("challenge", scopeKey, event.id),
      type: "challenge",
      title: copy.title,
      body: event.xp > 0 ? copy.bodyWithXp.replace("{xp}", String(event.xp)) : copy.bodyWithoutXp,
      createdAt: event.createdAt,
      deepLink: copy.deepLink,
    };
  }
  return null;
}
