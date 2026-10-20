import { getCatchRarity } from "../utils/rarity.js";
import { DEFAULT_SPECIES } from "../../../shared/constants/speciesCatalog.js";
import { CATCH_VISIBILITY, LOCATION_PRECISION, normalizeCatchPrivacy } from "../../privacy/data/privacyModel.js";

export function shouldIncludeCatchWater(record) {
  const privacy = normalizeCatchPrivacy(record?.privacy);
  return Boolean(record?.waterId)
    && privacy.visibility === CATCH_VISIBILITY.PUBLIC
    && !privacy.privateSpot
    && privacy.locationPrecision === LOCATION_PRECISION.EXACT;
}

export function createCatchShareData(record, water = null) {
  if (!record || typeof record.species !== "string" || !record.species.trim()) {
    throw new TypeError("Úlovek nemá platný název druhu pro sdílení.");
  }
  const visibleWater = shouldIncludeCatchWater(record)
    && water?.id === record.waterId
    ? String(water.name ?? "").trim()
    : "";
  const rarity = getCatchRarity(record, DEFAULT_SPECIES);
  return {
    species: record.species,
    rarity: rarity.label,
    rarityKey: rarity.key,
    weightKg: Number.isFinite(record.weightKg) ? record.weightKg : null,
    weightSource: record.weightSource === "estimated" ? "estimated" : "manual",
    lengthCm: Number.isFinite(record.lengthCm) ? record.lengthCm : null,
    caughtAt: Number.isFinite(Date.parse(record.caughtAt)) ? record.caughtAt : null,
    waterName: visibleWater || null,
  };
}

export function formatCatchShareText(data) {
  const measurements = [
    data.weightKg !== null ? `${data.weightSource === "estimated" ? "≈ " : ""}${data.weightKg.toLocaleString("cs-CZ")} kg${data.weightSource === "estimated" ? " (odhad)" : ""}` : null,
    data.lengthCm !== null ? `${data.lengthCm.toLocaleString("cs-CZ")} cm` : null,
  ].filter(Boolean);
  const date = data.caughtAt
    ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(new Date(data.caughtAt))
    : "";
  return [
    `${data.species}${measurements.length ? ` · ${measurements.join(" · ")}` : ""}`,
    data.rarity ? `Vzácnost: ${data.rarity}` : "",
    data.waterName,
    date,
    "Zaznamenáno v ChytnuCz",
  ].filter(Boolean).join("\n");
}

export function getCatchShareFileName(data) {
  const safeSpecies = data.species.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `chytnucz-${safeSpecies || "ulovek"}.png`;
}
