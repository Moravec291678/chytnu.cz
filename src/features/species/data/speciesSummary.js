export function selectSpeciesHighlight(catches) {
  if (!Array.isArray(catches) || catches.length === 0) return null;
  const measured = catches.filter((item) => Number.isFinite(item.weightKg));
  if (measured.length === 0) return catches[0];
  return measured.reduce((largest, item) => item.weightKg > largest.weightKg ? item : largest);
}
