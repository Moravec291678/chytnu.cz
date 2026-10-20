import { normalizeText } from "../../../shared/utils/helpers.js";

export const WATER_TYPES = Object.freeze([
  "Rybník",
  "Řeka",
  "Přehrada",
  "Lom",
]);

export const WATER_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const MAX_NAME_LENGTH = 120;
const MAX_WATER_NUMBER_LENGTH = 40;
const MAX_AREA_LENGTH = 160;
const MAX_NOTES_LENGTH = 1000;

function cleanTargetFish(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((fish) => String(fish || "").trim()).filter(Boolean))];
}

export function validateWaterForm(data) {
  const errors = {};
  if (!data?.name || !data.name.trim()) {
    errors.name = "Zadej název revíru.";
  } else if (data.name.trim().length > MAX_NAME_LENGTH) {
    errors.name = `Název může mít maximálně ${MAX_NAME_LENGTH} znaků.`;
  }
  if (!WATER_TYPES.includes(data?.type || "Rybník")) errors.type = "Vyber platný druh vody.";
  if (String(data?.waterNumber || "").trim().length > MAX_WATER_NUMBER_LENGTH) {
    errors.waterNumber = `Číslo revíru může mít maximálně ${MAX_WATER_NUMBER_LENGTH} znaků.`;
  }
  if (String(data?.area || "").trim().length > MAX_AREA_LENGTH) {
    errors.area = `Poloha může mít maximálně ${MAX_AREA_LENGTH} znaků.`;
  }
  if (String(data?.notes || "").trim().length > MAX_NOTES_LENGTH) {
    errors.notes = `Poznámka může mít maximálně ${MAX_NOTES_LENGTH} znaků.`;
  }
  if (data?.targetFish !== undefined && !Array.isArray(data.targetFish)) errors.targetFish = "Druhy ryb mají neplatný formát.";
  return errors;
}

export function createWaterRecord(data, scope = {}) {
  const now = new Date().toISOString();
  return {
    id: data?.id || crypto.randomUUID(),
    scopeKey: scope?.scopeKey || "guest",
    ownerId: scope?.ownerId || null,
    name: (data?.name || "").trim(),
    waterNumber: data?.waterNumber ? String(data.waterNumber).trim() : null,
    type: WATER_TYPES.includes(data?.type) ? data.type : "Rybník",
    area: (data?.area || "").trim() || null,
    coordinates: data?.coordinates || null,
    notes: (data?.notes || "").trim() || null,
    targetFish: cleanTargetFish(data?.targetFish),
    isFavorite: Boolean(data?.isFavorite),
    moderationStatus: "pending",
    createdAt: data?.createdAt || now,
    updatedAt: now,
  };
}

export function updateWaterRecord(existing, data) {
  if (!existing?.id) throw new TypeError("Upravovaný revír nemá stabilní ID.");
  return {
    ...existing,
    name: String(data?.name ?? "").trim(),
    waterNumber: data?.waterNumber ? String(data.waterNumber).trim() : null,
    type: WATER_TYPES.includes(data?.type) ? data.type : existing.type,
    area: String(data?.area ?? "").trim() || null,
    notes: String(data?.notes ?? "").trim() || null,
    targetFish: cleanTargetFish(data?.targetFish),
    updatedAt: new Date().toISOString(),
  };
}

export function filterWaters(waters, { query = "", favoriteOnly = false, type = "" } = {}) {
  const normalizedQuery = normalizeText(query);
  return (waters || []).filter((water) => {
    if (favoriteOnly && !water.isFavorite) return false;
    if (type && water.type !== type) return false;
    if (normalizedQuery) {
      const searchContent = [water.name, water.waterNumber, water.type, water.area, ...(water.targetFish || [])]
        .filter(Boolean)
        .map(normalizeText)
        .join(" ");
      if (!searchContent.includes(normalizedQuery)) return false;
    }
    return true;
  });
}

function matchesWaterActivity(activity, water) {
  if (activity?.waterId && activity.waterId === water.id) return true;
  const locationName = normalizeText(activity?.locationName ?? "");
  if (!locationName) return false;
  return [water.name, water.waterNumber]
    .filter(Boolean)
    .some((value) => normalizeText(value) === locationName);
}

export function buildWaterActivity(waters, catches, trips, { now = new Date(), windowMs = WATER_ACTIVITY_WINDOW_MS } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const startMs = nowMs - windowMs;
  const activityByWaterId = new Map((waters ?? []).map((water) => [water.id, { recentCount: 0, isActive: false }]));
  if (!Number.isFinite(nowMs)) return activityByWaterId;

  const addActivity = (entries, timestampKey, isTrip = false) => {
    for (const entry of entries ?? []) {
      const timestamp = Date.parse(entry?.[timestampKey]);
      if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > nowMs) continue;
      for (const water of waters ?? []) {
        if (!matchesWaterActivity(entry, water)) continue;
        const activity = activityByWaterId.get(water.id);
        activity.recentCount += 1;
        if (isTrip && !entry.endedAt) activity.isActive = true;
      }
    }
  };

  addActivity(catches, "caughtAt");
  addActivity(trips, "startedAt", true);
  for (const trip of trips ?? []) {
    if (trip?.endedAt) continue;
    for (const water of waters ?? []) {
      if (matchesWaterActivity(trip, water)) activityByWaterId.get(water.id).isActive = true;
    }
  }
  return activityByWaterId;
}
