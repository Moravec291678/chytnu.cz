export function createCatchShareData(record) {
  if (!record || typeof record.species !== "string" || !record.species.trim()) {
    throw new TypeError("Úlovek nemá platný název druhu pro sdílení.");
  }
  return {
    species: record.species,
    weightKg: Number.isFinite(record.weightKg) ? record.weightKg : null,
    weightSource: record.weightSource === "estimated" ? "estimated" : "manual",
    lengthCm: Number.isFinite(record.lengthCm) ? record.lengthCm : null,
    caughtAt: Number.isFinite(Date.parse(record.caughtAt)) ? record.caughtAt : null,
  };
}

export function formatCatchShareText(data) {
  const measurements = [
    data.weightKg !== null ? `${data.weightSource === "estimated" ? "≈ " : ""}${data.weightKg.toLocaleString("cs-CZ")} kg${data.weightSource === "estimated" ? " (odhad)" : ""}` : null,
    data.lengthCm !== null ? `${data.lengthCm.toLocaleString("cs-CZ")} cm` : null,
  ].filter(Boolean);
  const date = data.caughtAt
    ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(new Date(data.caughtAt))
    : "";
  return [`${data.species}${measurements.length ? ` · ${measurements.join(" · ")}` : ""}`, date, "Zaznamenáno v ChytnuCz"].filter(Boolean).join("\n");
}

export function getCatchShareFileName(data) {
  const safeSpecies = data.species.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `chytnucz-${safeSpecies || "ulovek"}.png`;
}
