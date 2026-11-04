const UNKNOWN_SPECIES = new Set(["unknown", "unspecified", "unidentified"]);
const confirmedSpeciesKey = (record) => typeof record.speciesKey === "string" && record.speciesKey.trim()
  && !UNKNOWN_SPECIES.has(record.speciesKey) ? record.speciesKey : null;
function increment(map, key) { if (key) map[key] = (map[key] ?? 0) + 1; }
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

// Local-only evidence contains IDs. providerSummary excludes IDs, locations, notes and photos.
export function analyzeDiary(records, { timeZone = "Europe/Prague", from = null, to = null } = {}) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit" });
  const start = from == null ? -Infinity : Date.parse(from);
  const end = to == null ? Infinity : Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end) || start >= end) throw new TypeError("Invalid analysis period.");
  const species = Object.create(null), hours = Object.create(null), months = Object.create(null), methods = Object.create(null), baits = Object.create(null);
  const evidenceIds = [], seen = new Set();
  let missingSpecies = 0, missingLength = 0, missingWeight = 0, measuredLengthCount = 0, totalLength = 0, longestCm = null;
  for (const record of records) {
    const timestamp = Date.parse(record.caughtAt);
    if (record.deleted || !record.id || seen.has(record.id) || !Number.isFinite(timestamp) || timestamp < start || timestamp >= end) continue;
    seen.add(record.id); evidenceIds.push(record.id);
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
    increment(hours, parts.hour); increment(months, `${parts.year}-${parts.month}`);
    const speciesKey = confirmedSpeciesKey(record);
    if (speciesKey) increment(species, speciesKey); else missingSpecies += 1;
    if (positive(record.lengthCm)) {
      measuredLengthCount += 1; totalLength += record.lengthCm;
      longestCm = Math.max(longestCm ?? 0, record.lengthCm);
    } else missingLength += 1;
    if (!positive(record.weightKg) || record.weightSource === "estimated") missingWeight += 1;
    increment(methods, record.method?.key);
    for (const key of new Set((record.baits ?? []).map((bait) => bait.key))) increment(baits, key);
  }
  const count = evidenceIds.length;
  return {
    evidenceIds,
    providerSummary: { count, species, hours, months, methods, baits, measuredLengthCount,
      meanLengthCm: measuredLengthCount ? totalLength / measuredLengthCount : null, longestCm,
      missing: { species: missingSpecies, length: missingLength, measuredWeight: missingWeight },
      period: { from, to, timeZone },
      limitations: ["Recorded catches only; no fishing effort denominator, no catch probability or causal conclusion.",
        ...(count < 10 ? ["Small sample: descriptive results only."] : [])] },
  };
}
