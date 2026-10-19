export function isMeasuredCatchWeight(record) {
  return Number.isFinite(record?.weightKg) && record?.weightSource !== "estimated";
}

export function formatCatchWeight(record, { maximumFractionDigits = 2 } = {}) {
  if (!Number.isFinite(record?.weightKg)) return null;
  const value = record.weightKg.toLocaleString("cs-CZ", { maximumFractionDigits });
  return record.weightSource === "estimated" ? `≈ ${value}` : value;
}
