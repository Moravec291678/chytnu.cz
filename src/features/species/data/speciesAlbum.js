function measuredMaximum(records, field) {
  const values = records.map((record) => record[field]).filter((value) => Number.isFinite(value));
  return values.length ? Math.max(...values) : null;
}

export function buildSpeciesAlbum(catches, catalog) {
  const grouped = new Map();
  for (const record of catches) {
    if (!record?.speciesKey) continue;
    const group = grouped.get(record.speciesKey) ?? [];
    group.push(record);
    grouped.set(record.speciesKey, group);
  }

  return catalog.map((species) => {
    const records = grouped.get(species.key) ?? [];
    const timestamps = records.map((record) => Date.parse(record.caughtAt)).filter(Number.isFinite).sort((a, b) => a - b);
    return {
      ...species,
      discovered: records.length > 0,
      catchCount: records.length,
      bestWeightKg: measuredMaximum(records, "weightKg"),
      bestLengthCm: measuredMaximum(records, "lengthCm"),
      firstCaughtAt: timestamps.length ? new Date(timestamps[0]).toISOString() : null,
      lastCaughtAt: timestamps.length ? new Date(timestamps.at(-1)).toISOString() : null,
    };
  });
}
