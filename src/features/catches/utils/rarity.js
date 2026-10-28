import { isMeasuredCatchWeight } from "../data/catchWeight.js";

export const RARITY_LEVELS = Object.freeze({
  COMMON: { key: "common", label: "Běžný", color: "gray", rule: "Běžný druh" },
  UNCOMMON: { key: "uncommon", label: "Méně běžný", color: "green", rule: "Méně obvyklý nebo nepůvodní druh" },
  RARE: { key: "rare", label: "Vzácný", color: "blue", rule: "Chráněný druh nebo měřená hmotnost od 5 kg" },
  EPIC: { key: "epic", label: "Epický", color: "purple", rule: "Délka od 75 cm nebo měřená hmotnost od 10 kg" },
  LEGENDARY: { key: "legendary", label: "Legendární", color: "gold", rule: "Délka od 100 cm nebo měřená hmotnost od 20 kg" },
});

export function getCatchRarity(record, speciesCatalog = []) {
  if (!record) return RARITY_LEVELS.COMMON;
  const speciesConfig = (speciesCatalog || []).find((item) => item.key === record.speciesKey) ?? record.speciesConfig;

  // Legendary: Trophy / extreme record (e.g. weight >= 20 kg or length >= 100 cm)
  if ((isMeasuredCatchWeight(record) && record.weightKg >= 20) || (Number.isFinite(record.lengthCm) && record.lengthCm >= 100)) {
    return RARITY_LEVELS.LEGENDARY;
  }

  // Epic: Large specimen (weight >= 10 kg or length >= 75 cm)
  if ((isMeasuredCatchWeight(record) && record.weightKg >= 10) || (Number.isFinite(record.lengthCm) && record.lengthCm >= 75)) {
    return RARITY_LEVELS.EPIC;
  }

  // Rare: Protected species or notable specimen (weight >= 5 kg)
  if (speciesConfig?.isProtected || (isMeasuredCatchWeight(record) && record.weightKg >= 5)) {
    return RARITY_LEVELS.RARE;
  }

  // Uncommon: Not common species or non-native
  if (speciesConfig?.isCommon === false) {
    return RARITY_LEVELS.UNCOMMON;
  }

  return RARITY_LEVELS.COMMON;
}


