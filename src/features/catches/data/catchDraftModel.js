export function applySelectedWaterToCatchDraft(data, water) {
  if (!data || !water?.id || !water?.name) return data;
  return {
    ...data,
    waterId: water.id,
    locationName: water.name,
    waterNumber: String(water.waterNumber || "").replace(/\D/g, ""),
  };
}
