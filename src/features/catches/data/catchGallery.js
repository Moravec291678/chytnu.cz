import { normalizeText } from "../../../shared/utils/helpers.js";

function dateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildGalleryItems(catches = [], { ownerId = null } = {}) {
  return (Array.isArray(catches) ? catches : []).flatMap((record, catchIndex) => {
    if (!record || typeof record !== "object") return [];
    const catchId = record.id ?? `legacy-catch-${catchIndex}`;
    const photos = Array.isArray(record.photos) ? record.photos : [];
    return photos.map((photoValue, index) => {
      const photo = photoValue && typeof photoValue === "object" ? photoValue : {};
      const photoId = photo.id ?? `${catchId}-photo-${index}`;
      return {
        ...photo,
        id: photoId,
        photoId,
        catchId,
        ownerId: record.ownerId ?? ownerId ?? null,
        blob: photo.blob instanceof Blob ? photo.blob : null,
        cloud: photo.cloud && typeof photo.cloud === "object"
          ? photo.cloud
          : { state: "localOnly", provider: null, objectKey: null, sha256: null },
        species: record.species || "Neznámý druh",
        speciesKey: record.speciesKey || normalizeText(record.species || ""),
        caughtAt: record.caughtAt || "",
        waterId: record.waterId || null,
        locationName: record.locationName || "",
        isFavorite: Boolean(record.isFavorite),
        isPrimary: photo.id ? photo.id === record.primaryPhotoId || (!record.primaryPhotoId && index === 0) : index === 0,
        weightKg: Number.isFinite(record.weightKg) ? record.weightKg : null,
        hasLocalBytes: photo.blob instanceof Blob,
      };
    });
  });
}

/** Resolve local bytes first, then allow remote lookup only within the matching ready account scope. */
export function getGalleryPhotoLoadRequest(item, scope) {
  if (item?.blob instanceof Blob) return { kind: "local", blob: item.blob };
  if (!item || typeof item !== "object" || !item.ownerId || !item.catchId || !item.photoId
    || scope?.status !== "ready" || scope.ownerId !== item.ownerId || !scope.scopeKey) {
    return { kind: "missing", blob: null };
  }
  return {
    kind: "remote",
    options: { photo: item, ownerId: item.ownerId, catchId: item.catchId, scopeKey: scope.scopeKey },
  };
}

export function getGalleryMissingMessage(item) {
  return item?.cloud?.state === "synced"
    ? "Tato fotografie má cloudová metadata, ale úložiště není dostupné."
    : "Fotografie není na tomto zařízení dostupná.";
}

export function countActiveGalleryFilters(filters = {}) {
  return Number(Boolean(filters.speciesKey)) + Number(Boolean(filters.waterKey))
    + Number(Boolean(filters.period && filters.period !== "all")) + Number(Boolean(filters.favoriteOnly));
}

export function getGalleryOptions(items) {
  const species = new Map();
  const waters = new Map();
  items.forEach((item) => {
    if (item.speciesKey) species.set(item.speciesKey, item.species);
    const key = item.waterId ? `id:${item.waterId}` : item.locationName ? `name:${normalizeText(item.locationName)}` : "";
    const label = item.locationName || (item.waterId ? "Revír" : "");
    if (key && label) waters.set(key, { key, label });
  });
  return {
    species: [...species].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, "cs")),
    waters: [...waters.values()].sort((a, b) => a.label.localeCompare(b.label, "cs")),
  };
}

export function filterAndSortGallery(items, filters = {}, now = new Date()) {
  const query = normalizeText(filters.search || "");
  const currentYear = now.getFullYear();
  const monthKey = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const filtered = items.filter((item) => {
    const day = dateKey(item.caughtAt);
    const waterKey = item.waterId ? `id:${item.waterId}` : item.locationName ? `name:${normalizeText(item.locationName)}` : "";
    const searchText = normalizeText(`${item.species} ${item.locationName}`);
    return (!query || searchText.includes(query))
      && (!filters.speciesKey || item.speciesKey === filters.speciesKey)
      && (!filters.waterKey || waterKey === filters.waterKey)
      && (!filters.favoriteOnly || item.isFavorite)
      && (filters.period !== "month" || day.startsWith(monthKey))
      && (filters.period !== "year" || day.startsWith(String(currentYear)))
      && (!filters.period || !filters.period.startsWith("custom:") || (day && day >= (filters.dateFrom || "") && day <= (filters.dateTo || "9999-99-99")));
  });
  return filtered.sort((a, b) => {
    if (filters.sort === "heaviest") return (b.weightKg ?? -1) - (a.weightKg ?? -1) || Date.parse(b.caughtAt) - Date.parse(a.caughtAt);
    const delta = (Date.parse(a.caughtAt) || 0) - (Date.parse(b.caughtAt) || 0);
    return (filters.sort === "oldest" ? delta : -delta) || String(a.photoId).localeCompare(String(b.photoId));
  });
}
