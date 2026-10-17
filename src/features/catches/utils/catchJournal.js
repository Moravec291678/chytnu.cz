import { normalizeText } from "../../../shared/utils/helpers.js";

function localDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function filterAndSortCatches(catches, filters, trips = []) {
  const query = normalizeText(filters.search ?? "");
  const tripNames = new Map(trips.map((trip) => [trip.id, trip.title]));
  const filtered = catches.filter((item) => {
    const searchable = [item.species, item.speciesLatin, item.locationName, item.method?.label,
      ...(item.baits ?? []).map((bait) => bait.label), item.notes, tripNames.get(item.tripId)]
      .filter(Boolean).map(normalizeText).join(" ");
    const date = localDate(item.caughtAt);
    return (!query || searchable.includes(query))
      && (!filters.speciesKey || item.speciesKey === filters.speciesKey)
      && (!filters.dateFrom || date >= filters.dateFrom)
      && (!filters.dateTo || date <= filters.dateTo)
      && (!filters.favoriteOnly || item.isFavorite)
      && (!filters.result || item.result === filters.result)
      && (!filters.methodKey || item.method?.key === filters.methodKey)
      && (!filters.tripId || item.tripId === filters.tripId);
  });
  const sort = filters.sort ?? "newest";
  const valueKey = sort === "heaviest" || sort === "lightest" ? "weightKg" : "lengthCm";
  const ascending = sort === "oldest" || sort === "lightest" || sort === "shortest";
  return filtered.sort((a, b) => {
    if (sort === "newest" || sort === "oldest") {
      const delta = Date.parse(a.caughtAt) - Date.parse(b.caughtAt);
      return (ascending ? delta : -delta) || a.id.localeCompare(b.id);
    }
    const aValue = a[valueKey];
    const bValue = b[valueKey];
    if (!Number.isFinite(aValue)) return Number.isFinite(bValue) ? 1 : a.id.localeCompare(b.id);
    if (!Number.isFinite(bValue)) return -1;
    return (ascending ? aValue - bValue : bValue - aValue) || a.id.localeCompare(b.id);
  });
}

export function hasActiveJournalFilters(filters) {
  return Boolean(filters.search || filters.speciesKey || filters.dateFrom || filters.dateTo
    || filters.favoriteOnly || filters.result || filters.methodKey || filters.tripId);
}
