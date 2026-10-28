import { validateDataScope } from "../../auth/data/localDataScope.js";

export const NOTIFICATION_TYPES = Object.freeze([
  "sync_problem",
  "achievement",
  "challenge",
  "active_trip",
  "app_update",
]);

const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;
const MAX_DEEP_LINK_LENGTH = 300;

export function normalizeNotificationDeepLink(value) {
  if (typeof value !== "string") return null;
  const link = value.trim();
  if (!link.startsWith("/") || link.startsWith("//") || link.length > MAX_DEEP_LINK_LENGTH
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
  if (!id || id.length > MAX_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(id)) throw new TypeError("Oznámení nemá platné ID.");
  if (!NOTIFICATION_TYPES.includes(input?.type)) throw new TypeError("Oznámení má nepodporovaný typ.");
  if (!title || title.length > MAX_TITLE_LENGTH) throw new TypeError("Název oznámení musí mít 1 až 120 znaků.");
  if (!body || body.length > MAX_BODY_LENGTH) throw new TypeError("Text oznámení musí mít 1 až 500 znaků.");
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
  return `n_${parts.map((part) => String(part ?? "")).join("_").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, MAX_ID_LENGTH - 2)}`;
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
    return {
      id: stableNotificationId("achievement", scopeKey, event.id),
      type: "achievement",
      title: "Nový úspěch",
      body: event.xp > 0 ? `Odemkl(a) jsi nový úspěch a získal(a) ${event.xp} XP.` : "Odemkl(a) jsi nový úspěch. Podívej se na svůj postup.",
      createdAt: event.createdAt,
      deepLink: "/achievements",
    };
  }
  if (event?.type === "challenge.completed") {
    return {
      id: stableNotificationId("challenge", scopeKey, event.id),
      type: "challenge",
      title: "Výzva dokončena",
      body: event.xp > 0 ? `Dokončil(a) jsi výzvu a získal(a) ${event.xp} XP.` : "Dokončil(a) jsi svou výzvu.",
      createdAt: event.createdAt,
      deepLink: "/challenges",
    };
  }
  return null;
}
