import { SPECIES_CATEGORIES } from "../../../shared/constants/speciesCatalog.js";
import { normalizeText } from "../../../shared/utils/helpers.js";

export function getPrimarySpeciesCategoryKey(species) {
  if (!species) return "";
  if (species.categoryKey === "cyprinids") return "cyprinids";
  if (species.categoryKey === "salmonids") return "salmonids";
  if (species.categoryKey === "catfish") return "catfish";
  if (species.categoryKey === "eels") return "eels";
  if (species.categoryKey === "sturgeons") return "sturgeons";
  if (species.isPredator) return "predators";
  return "smallFish";
}

export function getSpeciesForCategory(categoryKey, speciesCatalog) {
  switch (categoryKey) {
    case "common":
      return speciesCatalog.filter((species) => species.isCommon);
    case "protected":
      return speciesCatalog.filter((species) => species.isProtected);
    case "nonNative":
      return speciesCatalog.filter((species) => species.isNonNative);
    case "cyprinids":
    case "salmonids":
    case "catfish":
    case "eels":
    case "sturgeons":
      return speciesCatalog.filter((species) => species.categoryKey === categoryKey);
    case "predators":
      return speciesCatalog.filter((species) => species.isPredator);
    case "smallFish":
      return speciesCatalog.filter((species) => getPrimarySpeciesCategoryKey(species) === "smallFish");
    default:
      return [];
  }
}

export function filterSpeciesCatalog(speciesCatalog, query) {
  const normalizedQuery = normalizeText(query);
  return speciesCatalog.filter((species) => (
    normalizeText(`${species.label} ${species.latinName ?? ""}`).includes(normalizedQuery)
  ));
}

export function getSpeciesCategory(categoryKey) {
  return SPECIES_CATEGORIES.find((category) => category.key === categoryKey) ?? null;
}
