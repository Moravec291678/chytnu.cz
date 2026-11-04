import { DEFAULT_SPECIES } from "../../shared/constants/speciesCatalog.js";

const knownSpecies = new Set(DEFAULT_SPECIES.map((species) => species.key));
const score = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const keysOnly = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));

// Confidence is an uncalibrated model score, never a measured probability.
export function validateSpeciesSuggestion(value) {
  if (!object(value) || !keysOnly(value, ["status", "speciesKey", "confidence", "alternatives", "fishCount"])
    || !["suggestion", "unknown"].includes(value.status)
    || !Number.isInteger(value.fishCount) || value.fishCount < 0
    || !Array.isArray(value.alternatives) || value.alternatives.length > 3) throw new TypeError("Invalid species response.");
  const alternatives = value.alternatives.map((item) => {
    if (!object(item) || !keysOnly(item, ["speciesKey", "confidence"])
      || !knownSpecies.has(item.speciesKey) || !score(item.confidence)) throw new TypeError("Invalid alternative.");
    return { speciesKey: item.speciesKey, confidence: item.confidence };
  });
  if (value.status === "unknown" || value.fishCount !== 1) {
    if (value.status === "unknown" && (value.speciesKey != null || value.confidence != null)) throw new TypeError("Unknown species must remain empty.");
    return { status: "unknown", speciesKey: null, confidence: null, alternatives: [], fishCount: value.fishCount };
  }
  if (!knownSpecies.has(value.speciesKey) || !score(value.confidence)
    || new Set(alternatives.map((item) => item.speciesKey)).size !== alternatives.length
    || alternatives.some((item) => item.speciesKey === value.speciesKey)) throw new TypeError("Invalid species prediction.");
  return { status: "suggestion", speciesKey: value.speciesKey, confidence: value.confidence, alternatives, fishCount: 1 };
}

// Store separately from confirmed species. This function never assigns speciesKey.
export function attachSpeciesSuggestion(record, suggestion, { expectedPhotoId, expectedRevision }) {
  if (!record || record.deleted || record.sync?.revision !== expectedRevision
    || !(record.photos ?? []).some((photo) => photo.id === expectedPhotoId)
    || record.speciesKey || record.quickCatch?.provenance?.speciesKey === "manual") return record;
  return { ...record, aiSpeciesSuggestion: { ...validateSpeciesSuggestion(suggestion), photoId: expectedPhotoId } };
}
