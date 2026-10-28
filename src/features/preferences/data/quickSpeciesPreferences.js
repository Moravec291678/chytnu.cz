import { DEFAULT_SPECIES } from "../../../shared/constants/speciesCatalog.js";
import { PRODUCT_LIMITS } from "../../../product/config/limits.js";

export const MAX_QUICK_SPECIES = PRODUCT_LIMITS.quickSpecies;
export const DEFAULT_QUICK_SPECIES_IDS = Object.freeze([
  "commonCarp", "northernPike", "zander", "europeanPerch",
  "brownTrout", "tench", "welsCatfish",
]);

const catalogIds = new Set(DEFAULT_SPECIES.map((species) => species.key));
const STORAGE_PREFIX = "chytnu:preferences:v1:quickSpecies:";

export function normalizeQuickSpeciesIds(ids, validIds = catalogIds) {
  if (!Array.isArray(ids)) return null;
  const normalized = [];
  for (const id of ids) {
    if (typeof id === "string" && validIds.has(id) && !normalized.includes(id)) normalized.push(id);
  }
  return normalized.slice(0, MAX_QUICK_SPECIES);
}

function preferenceKey(scopeKey) {
  return `${STORAGE_PREFIX}${encodeURIComponent(scopeKey || "default")}`;
}

export function readQuickSpeciesIds(scopeKey, storage = globalThis.localStorage, validIds = catalogIds) {
  try {
    const raw = storage?.getItem(preferenceKey(scopeKey));
    if (raw === null || raw === undefined) return [...DEFAULT_QUICK_SPECIES_IDS];
    return normalizeQuickSpeciesIds(JSON.parse(raw), validIds) ?? [...DEFAULT_QUICK_SPECIES_IDS];
  } catch {
    return [...DEFAULT_QUICK_SPECIES_IDS];
  }
}

export function saveQuickSpeciesIds(scopeKey, ids, storage = globalThis.localStorage, validIds = catalogIds) {
  const normalized = normalizeQuickSpeciesIds(ids, validIds);
  if (!normalized) throw new Error("Rychlý výběr druhů nemá platný formát.");
  try {
    storage?.setItem(preferenceKey(scopeKey), JSON.stringify(normalized));
  } catch (error) {
    throw new Error(`Rychlý výběr se nepodařilo uložit: ${error?.message || "úložiště není dostupné"}`, { cause: error });
  }
  return normalized;
}

export function toggleQuickSpecies(ids, speciesId, validIds = catalogIds) {
  const current = normalizeQuickSpeciesIds(ids, validIds) ?? [...DEFAULT_QUICK_SPECIES_IDS];
  if (current.includes(speciesId)) return { ids: current.filter((id) => id !== speciesId), error: "" };
  if (!validIds.has(speciesId)) return { ids: current, error: "Tento druh už v katalogu není." };
  if (current.length >= MAX_QUICK_SPECIES) return { ids: current, error: "V rychlém výběru může být maximálně 8 druhů." };
  return { ids: [...current, speciesId], error: "" };
}
