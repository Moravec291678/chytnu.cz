import { normalizeText } from "../../../shared/utils/helpers.js";

export const WATER_TYPES = Object.freeze([
  "Rybník",
  "Řeka",
  "Přehrada",
  "Lom",
  "Jiné",
]);

export function validateWaterForm(data) {
  const errors = {};
  if (!data?.name || !data.name.trim()) {
    errors.name = "Zadej název revíru.";
  }
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
    type: data?.type || "Rybník",
    area: (data?.area || "").trim() || null,
    coordinates: data?.coordinates || null,
    notes: (data?.notes || "").trim() || null,
    targetFish: Array.isArray(data?.targetFish) ? data.targetFish : [],
    isFavorite: Boolean(data?.isFavorite),
    moderationStatus: data?.moderationStatus || "pending",
    createdAt: data?.createdAt || now,
    updatedAt: now,
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
