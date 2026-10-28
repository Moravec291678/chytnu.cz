import { normalizeText } from "../../../shared/utils/helpers.js";
import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { isCatchDateEligibleForProgression } from "../../catches/data/catchVerification.js";

function measuredMaximum(records, field) {
  return records.reduce((maximum, record) => {
      if (field === "weightKg" && !isMeasuredCatchWeight(record)) return maximum;
      const value = record[field];
    return Number.isFinite(value) && (!maximum || value > maximum[field]) ? record : maximum;
  }, null);
}

export function buildSpeciesAlbum(catches, catalog, mastery = [], now = new Date()) {
  const grouped = new Map();
  const masteryBySpecies = new Map(mastery.map((item) => [item.speciesKey, item]));
  for (const record of catches) {
    if (!record?.speciesKey) continue;
    const group = grouped.get(record.speciesKey) ?? [];
    group.push(record);
    grouped.set(record.speciesKey, group);
  }

  return catalog.map((species) => {
    const records = grouped.get(species.key) ?? [];
    const progressionRecords = records.filter((record) => isCatchDateEligibleForProgression(record, now));
    const speciesMastery = masteryBySpecies.get(species.key);
    const timestamps = records.map((record) => Date.parse(record.caughtAt)).filter(Number.isFinite).sort((a, b) => a - b);
    return {
      ...species,
      discovered: records.length > 0 || (speciesMastery?.level ?? 0) > 0,
      catchCount: records.length,
      masteryLevel: speciesMastery?.level ?? 0,
      stars: speciesMastery?.stars ?? 0,
      bestWeightCatch: measuredMaximum(progressionRecords, "weightKg"),
      bestLengthCatch: measuredMaximum(progressionRecords, "lengthCm"),
      bestWeightKg: measuredMaximum(progressionRecords, "weightKg")?.weightKg ?? null,
      bestLengthCm: measuredMaximum(progressionRecords, "lengthCm")?.lengthCm ?? null,
      firstCaughtAt: timestamps.length ? new Date(timestamps[0]).toISOString() : null,
      lastCaughtAt: timestamps.length ? new Date(timestamps.at(-1)).toISOString() : null,
    };
  });
}

const SEASONS = [
  { key: "winter", name: "Zima", months: [11, 0, 1] },
  { key: "spring", name: "Jaro", months: [2, 3, 4] },
  { key: "summer", name: "Léto", months: [5, 6, 7] },
  { key: "autumn", name: "Podzim", months: [8, 9, 10] },
];

export const SPECIES_ALBUM_TIME_ZONE = "Europe/Prague";

function localCalendarParts(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SPECIES_ALBUM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(timestamp));
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { year: Number(fields.year), month: Number(fields.month) - 1 };
}

export function getSpeciesAlbumYear(date = new Date()) {
  const timestamp = date instanceof Date ? date.getTime() : Date.parse(date);
  if (!Number.isFinite(timestamp)) return null;
  return localCalendarParts(timestamp).year;
}

function dateParts(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return { timestamp, ...localCalendarParts(timestamp) };
}

function getSeason(month) {
  return SEASONS.find((season) => season.months.includes(month));
}

export function buildLocationCollections(catches, trips) {
  const locations = new Map();
  const addRecord = (record, type) => {
    const name = typeof record.locationName === "string" ? record.locationName.trim() : "";
    if (!name) return;
    const key = normalizeText(name);
    const location = locations.get(key) ?? { key, name, catchCount: 0, tripCount: 0, latestTimestamp: 0 };
    const date = dateParts(type === "catch" ? record.caughtAt : record.startedAt);
    if (type === "catch") location.catchCount += 1;
    else location.tripCount += 1;
    location.latestTimestamp = Math.max(location.latestTimestamp, date?.timestamp ?? 0);
    locations.set(key, location);
  };

  catches.forEach((record) => addRecord(record, "catch"));
  trips.forEach((record) => addRecord(record, "trip"));
  return [...locations.values()].sort((a, b) => b.latestTimestamp - a.latestTimestamp || a.name.localeCompare(b.name, "cs-CZ"));
}

export function buildSeasonCollections(catches, trips, year = getSpeciesAlbumYear()) {
  const collections = new Map();
  const addRecord = (record, type) => {
    const date = dateParts(type === "catch" ? record.caughtAt : record.startedAt);
    if (!date || date.year !== year) return;
    const season = getSeason(date.month);
    const collection = collections.get(season.key) ?? {
      ...season,
      year,
      catchCount: 0,
      tripCount: 0,
      latestTimestamp: 0,
    };
    if (type === "catch") collection.catchCount += 1;
    else collection.tripCount += 1;
    collection.latestTimestamp = Math.max(collection.latestTimestamp, date.timestamp);
    collections.set(season.key, collection);
  };

  catches.forEach((record) => addRecord(record, "catch"));
  trips.forEach((record) => addRecord(record, "trip"));
  return [...collections.values()].sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

export function buildTrophyRecords(catches, catalog, limit = 5, now = new Date()) {
  const speciesByKey = new Map(catalog.map((species) => [species.key, species]));
  return catches
    .filter((record) => isCatchDateEligibleForProgression(record, now) && isMeasuredCatchWeight(record))
    .map((record) => {
      const species = speciesByKey.get(record.speciesKey);
      return {
        speciesKey: record.speciesKey,
        speciesName: species?.label || record.species || "Druh neuveden",
        catch: record,
      };
    })
    .sort((a, b) => b.catch.weightKg - a.catch.weightKg)
    .slice(0, limit);
}
