import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { normalizeText } from "../../../shared/utils/helpers.js";

function validTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function newestDate(current, candidate) {
  const candidateTime = validTimestamp(candidate);
  if (candidateTime === null) return current;
  const currentTime = validTimestamp(current);
  return currentTime === null || candidateTime > currentTime ? candidate : current;
}

function validCoordinates(value) {
  if (!value) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function catchWaterIdentity(record, watersById = new Map()) {
  const savedWater = record?.waterId ? watersById.get(record.waterId) : null;
  const name = String(savedWater?.name || record?.locationName || "").trim();
  const waterNumber = String(savedWater?.waterNumber || record?.waterNumber || "").trim();
  if (savedWater) return { key: `id:${savedWater.id}`, name, waterId: savedWater.id };
  if (name) return { key: `name:${normalizeText(name)}`, name, waterId: null };
  if (waterNumber) return { key: `number:${normalizeText(waterNumber)}`, name: `Revír ${waterNumber}`, waterId: null };
  return null;
}

export function buildWaterHotspots(catches = [], waters = []) {
  const watersById = new Map(waters.map((water) => [water.id, water]));
  const groups = new Map();

  for (const record of catches) {
    const identity = catchWaterIdentity(record, watersById);
    if (!identity) continue;
    const group = groups.get(identity.key) ?? {
      ...identity,
      catchCount: 0,
      species: new Set(),
      lastCatchAt: null,
    };
    group.catchCount += 1;
    if (record.species) group.species.add(record.species);
    group.lastCatchAt = newestDate(group.lastCatchAt, record.caughtAt);
    groups.set(identity.key, group);
  }

  return [...groups.values()]
    .map((group) => ({ ...group, species: [...group.species].sort((a, b) => a.localeCompare(b, "cs")) }))
    .sort((a, b) => b.catchCount - a.catchCount || a.name.localeCompare(b.name, "cs"));
}

export function buildSpeciesHotspots(catches = [], waters = []) {
  const watersById = new Map(waters.map((water) => [water.id, water]));
  const groups = new Map();

  for (const record of catches) {
    const name = String(record?.species || "").trim();
    if (!name) continue;
    const key = String(record.speciesKey || normalizeText(name));
    const group = groups.get(key) ?? {
      key,
      name,
      catchCount: 0,
      waterKeys: new Set(),
      bestWeightKg: null,
      lastCatchAt: null,
    };
    group.catchCount += 1;
    const water = catchWaterIdentity(record, watersById);
    if (water) group.waterKeys.add(water.key);
    if (isMeasuredCatchWeight(record) && (group.bestWeightKg === null || record.weightKg > group.bestWeightKg)) {
      group.bestWeightKg = record.weightKg;
    }
    group.lastCatchAt = newestDate(group.lastCatchAt, record.caughtAt);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(({ waterKeys, ...group }) => ({ ...group, waterCount: waterKeys.size }))
    .sort((a, b) => b.catchCount - a.catchCount || a.name.localeCompare(b.name, "cs"));
}

export function buildLocalHeatmap(catches = [], precision = 2) {
  const factor = 10 ** precision;
  const groups = new Map();

  for (const record of catches) {
    const coordinates = validCoordinates(record?.coordinates);
    if (!coordinates) continue;
    const latitudeCell = Math.round(coordinates.latitude * factor) / factor;
    const longitudeCell = Math.round(coordinates.longitude * factor) / factor;
    const key = `${latitudeCell}:${longitudeCell}`;
    const group = groups.get(key) ?? { key, catchCount: 0, species: new Set(), lastCatchAt: null };
    group.catchCount += 1;
    if (record.species) group.species.add(record.species);
    group.lastCatchAt = newestDate(group.lastCatchAt, record.caughtAt);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(({ species, ...group }) => ({ ...group, speciesCount: species.size }))
    .sort((a, b) => b.catchCount - a.catchCount || a.key.localeCompare(b.key));
}
