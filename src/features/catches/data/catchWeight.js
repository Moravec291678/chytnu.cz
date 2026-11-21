export function isMeasuredCatchWeight(record) {
  return Number.isFinite(record?.weightKg) && record?.weightSource !== "estimated";
}

export function formatCatchWeight(record, { maximumFractionDigits = 2 } = {}) {
  if (!Number.isFinite(record?.weightKg)) return null;
  const value = record.weightKg.toLocaleString("cs-CZ", { maximumFractionDigits });
  return record.weightSource === "estimated" ? `≈ ${value}` : value;
}

export function getCatchMeasurementLabels(record, options) {
  const length = Number.isFinite(record?.lengthCm)
    ? `${record.lengthCm.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} cm`
    : null;
  const weight = formatCatchWeight(record, options);
  return { length, weight: weight === null ? null : `${weight} kg`, estimated: weight !== null && record.weightSource === "estimated" };
}

export function formatCatchMeasurements(record, options) {
  const { length, weight } = getCatchMeasurementLabels(record, options);
  return [length, weight].filter(value => value !== null).join(" · ");
}
