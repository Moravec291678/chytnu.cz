import { DEFAULT_SPECIES } from "../../shared/constants/speciesCatalog.js";

// Only the explicit suggestion link supplies this state. The regular editor still
// requires Save, and a confirmed or deliberately cleared species stays authoritative.
export function speciesSuggestionForEditor(record, suggestion) {
  if (!record || !record.ownerId || suggestion?.ownerId !== record.ownerId || record.deleted || record.speciesKey || record.quickCatch?.provenance?.speciesKey === "manual"
    || suggestion?.status !== "suggestion" || record.sync?.revision !== suggestion.expectedRevision
    || !Object.hasOwn(suggestion, "expectedServerRevision")
    || (record.sync?.serverRevision ?? null) !== suggestion.expectedServerRevision) return null;
  const photo = record.photos?.find((item) => item.id === suggestion.photoId);
  if (!photo || (photo.cloud?.sha256 || photo.contentSha256) !== suggestion.photoHash || !suggestion.photoHash
    || suggestion.sourceSha256 !== suggestion.photoHash) return null;
  return DEFAULT_SPECIES.find((item) => item.key === suggestion.speciesKey) ?? null;
}
