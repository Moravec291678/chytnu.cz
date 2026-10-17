export function parseOptionalNumber(value, label, errors, { max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value).trim().replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || number > max) {
    errors[label] = `Zadej platnou hodnotu pro pole „${label}“.`;
    return null;
  }
  return number;
}

export function validateCatchForm(data) {
  const errors = {};
  if (!data.speciesKey) errors.species = "Vyber druh ryby.";
  if (!data.catchDate || Number.isNaN(Date.parse(`${data.catchDate}T${data.catchTime || "12:00"}`))) {
    errors.catchDate = "Zadej platné datum úlovku.";
  }
  parseOptionalNumber(data.weightKg, "Váha", errors, { max: 1000 });
  parseOptionalNumber(data.lengthCm, "Délka", errors, { max: 2000 });
  parseOptionalNumber(data.girthCm, "Obvod", errors, { max: 2000 });
  parseOptionalNumber(data.fightDurationMin, "Délka boje", errors, { max: 10000 });
  parseOptionalNumber(data.depthM, "Hloubka", errors, { max: 2000 });
  parseOptionalNumber(data.waterNumber, "Číslo revíru", errors, { max: 99999999 });
  return errors;
}

export function createCatchRecord(data, species, methods, existing = null, baitCatalog = []) {
  const numeric = (value) => value === "" ? null : Number(String(value).replace(",", "."));
  const now = new Date().toISOString();
  const caughtAt = new Date(`${data.catchDate}T${data.catchTime || "12:00"}`).toISOString();
  const method = methods.find((item) => item.key === data.fishingMethod);
  const existingMethod = existing?.method?.key === data.fishingMethod ? existing.method : null;
  const existingBaits = new Map((existing?.baits ?? []).map((bait) => [bait.key, bait]));
  return {
    ...(existing ?? {}),
    schemaVersion: 1,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sync: existing
      ? { ...(existing.sync ?? {}), status: "local", revision: (existing.sync?.revision ?? 0) + 1 }
      : { status: "local", revision: 1 },
    species: species.label,
    speciesKey: species.key,
    speciesLatin: species.latinName ?? null,
    weightKg: numeric(data.weightKg),
    lengthCm: numeric(data.lengthCm),
    girthCm: numeric(data.girthCm),
    fightMinutes: numeric(data.fightDurationMin),
    locationName: data.locationName.trim(),
    waterNumber: numeric(data.waterNumber),
    gpsLocation: data.gpsLocation.trim(),
    waterDepthM: numeric(data.depthM),
    bottomType: data.bottomType || null,
    caughtAt,
    tripId: data.tripId || null,
    method: method ? { key: method.key, label: method.label, isCustom: false } : existingMethod,
    baits: data.baits.map((key) => existingBaits.get(key) ?? ({ key, label: baitCatalog.find((bait) => bait.key === key)?.label ?? key, isCustom: !baitCatalog.some((bait) => bait.key === key) })),
    result: data.resultKey || "unspecified",
    photos: data.photos.map((photo) => {
      const storedPhoto = { ...photo };
      const file = storedPhoto.file;
      delete storedPhoto.previewUrl;
      delete storedPhoto.file;
      return {
        ...storedPhoto,
        id: photo.id ?? crypto.randomUUID(),
        blob: photo.blob ?? file,
        name: photo.name ?? file?.name ?? "fotografie",
        type: photo.type ?? file?.type ?? "image/jpeg",
      };
    }),
    notes: data.notes.trim(),
    isFavorite: Boolean(data.isFavorite),
  };
}

export function catchToForm(record) {
  const date = new Date(record.caughtAt);
  const pad = (value) => String(value).padStart(2, "0");
  const number = (value) => value ?? "";
  return {
    weightKg: number(record.weightKg), lengthCm: number(record.lengthCm),
    girthCm: number(record.girthCm), fightDurationMin: number(record.fightMinutes),
    locationName: record.locationName ?? "", waterNumber: number(record.waterNumber),
    catchDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    catchTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    gpsLocation: record.gpsLocation ?? "", depthM: number(record.waterDepthM),
    bottomType: record.bottomType ?? "", speciesKey: record.speciesKey,
    resultKey: record.result ?? "unspecified", fishingMethod: record.method?.key ?? "",
    photos: record.photos ?? [], baits: (record.baits ?? []).map((bait) => bait.key),
    notes: record.notes ?? "", isFavorite: Boolean(record.isFavorite), tripId: record.tripId ?? "",
  };
}
