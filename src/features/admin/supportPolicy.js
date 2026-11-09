export const SUPPORT_CATEGORIES = Object.freeze({ profile: "Diagnostika profilu", catches: "Vybrané úlovky bez lokalit a poznámek", photos: "Vybrané fotografie bez metadat", trips: "Vybrané vycházky bez lokalit", progression: "Postup, XP a odměny", sync: "Diagnostika synchronizace" });
export const SUPPORT_STATUSES = Object.freeze(["New", "Investigating", "Waiting for User", "Resolved", "Closed"]);
export const SUPPORT_STATUS_LABELS = Object.freeze({ New: "Nový", Investigating: "Řeší se", "Waiting for User": "Čeká na uživatele", Resolved: "Vyřešený", Closed: "Uzavřený" });
export const SUPPORT_MAX_HOURS = 72;
export function activeSupportGrant(grant, { uid, actorUid, caseId, category, now = Date.now() }) {
  return Boolean(grant && grant.ownerId === uid && grant.granteeUid === actorUid && grant.caseId === caseId && !grant.revokedAt
    && Date.parse(grant.expiresAt) > now && Date.parse(grant.createdAt) <= now && grant.categories?.includes(category));
}
export function safeSupportCatch(record) {
  if (!record || record.deleted) return null;
  const number = key => typeof record[key] === "number" && Number.isFinite(record[key]) && record[key] > 0 ? record[key] : null;
  const text = key => typeof record[key] === "string" ? record[key].slice(0, 160) : null;
  const choice = value => typeof value === "object" && value && typeof value.key === "string" && typeof value.label === "string" ? { key: value.key.slice(0,80), label: value.label.slice(0,160) } : typeof value === "string" ? { key: value.slice(0,80), label: value.slice(0,160) } : null;
  return { id: record.id, species: text("species"), speciesKey: text("speciesKey"), captureMode: record.captureMode === "quick" ? "quick" : "form", caughtAt: text("caughtAt"), lengthCm: number("lengthCm"), weightKg: number("weightKg"), weightSource: record.weightSource === "estimated" ? "estimated" : "manual", method: choice(record.method), baits: (Array.isArray(record.baits) ? record.baits : []).slice(0,20).map(choice).filter(Boolean), visibility: record.privacy?.visibility === "public" ? "public" : "private" };
}
export function safeSupportTrip(record) {
  if (!record || record.deleted) return null;
  return { id: record.id, startedAt: record.startedAt ?? null, endedAt: record.endedAt ?? null, status: record.status ?? null };
}
