export function isMeasuredCatchWeight(record) {
  return Number.isFinite(record?.weightKg) && record?.weightSource !== "estimated";
}

export function formatCatchWeight(record, { maximumFractionDigits = 2 } = {}) {
  if (!Number.isFinite(record?.weightKg)) return null;
  const value = record.weightKg.toLocaleString("cs-CZ", { maximumFractionDigits });
  return record.weightSource === "estimated" ? `≈ ${value}` : value;
}

export function formatCatchMeasurements(record, { maximumFractionDigits = 2 } = {}) {
  const measurements = [];
  if (Number.isFinite(record?.lengthCm)) {
    measurements.push(`${record.lengthCm.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} cm`);
  }
  const weight = formatCatchWeight(record, { maximumFractionDigits });
  if (weight !== null) measurements.push(`${weight} kg`);
  return measurements.join(" · ");
}
