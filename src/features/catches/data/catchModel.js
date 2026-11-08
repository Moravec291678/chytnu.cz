import { normalizeCoordinates, parseCoordinateText } from "./coordinates.js";
import { normalizeCatchPrivacy } from "../../privacy/data/privacyModel.js";
import { estimateFishWeight, formatEstimatedWeight } from "./lengthWeightRelationships.js";
import { hasCustomPhotoFrame, normalizePhotoFrame } from "./photoFraming.js";
import { MAX_LEGACY_PHOTOS_PER_CATCH, MAX_PHOTOS_PER_CATCH, normalizePrimaryPhotoId } from "./catchPhotos.js";
import { normalizeCatchVerification, normalizeLocationEvidence } from "./catchVerification.js";
import { PRODUCT_LIMITS } from "../../../product/config/limits.js";
import { ENVIRONMENT_FIELDS, ENVIRONMENT_LABELS, normalizeCatchEnvironment, calculateCatchAstronomy } from "./catchEnvironment.js";
import { calculateMoonPhase } from "../../../shared/utils/moonPhase.js";
import { isTripWaterTemperatureRelevant } from "./quickCatchTripSnapshot.js";

const CONDITION_SOURCE_FIELDS = ["airTempC", "waterTempC", "pressureHpa", "windKmh", "moonPhase"];

function normalizeConditionSources(sources, conditions) {
  return Object.fromEntries(CONDITION_SOURCE_FIELDS.flatMap((field) => {
    const present = conditions[field] !== undefined && conditions[field] !== null && conditions[field] !== "";
    const source = sources?.[field];
    if (!present && source !== "manual") return [];
    return [[field, present && source === "auto" ? "auto" : "manual"]];
  }));
}

export function updateCatchFormField(data, field, value) {
  const next = { ...data, [field]: value };
  if (field === "weightKg") {
    next.weightSource = String(value).trim() ? "manual" : "estimated";
    if (!String(value).trim()) {
      const estimate = estimateFishWeight(data.speciesKey, data.lengthCm);
      next.weightKg = estimate === null ? "" : formatEstimatedWeight(estimate);
    }
  } else if ((field === "lengthCm" || field === "speciesKey") && data.weightSource === "estimated") {
    const estimate = estimateFishWeight(next.speciesKey, next.lengthCm);
    next.weightKg = estimate === null ? "" : formatEstimatedWeight(estimate);
  }
  return next;
}

export function parseOptionalNumber(value, label, errors, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value).trim().replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < min || number > max) {
    errors[label] = `Zadej platnou hodnotu pro pole „${label}“.`;
    return null;
  }
  return number;
}
export function validateCatchForm(data, { allowUnknownSpecies = false } = {}) {
  const errors = {};
  if (!data.speciesKey && !allowUnknownSpecies) errors.species = "Vyber druh ryby.";
  if (!data.catchDate || Number.isNaN(Date.parse(`${data.catchDate}T${data.catchTime || "12:00"}`))) {
    errors.catchDate = "Zadej platné datum úlovku.";
  }
  parseOptionalNumber(data.weightKg, "Váha", errors, { max: PRODUCT_LIMITS.catch.weightKg });
  parseOptionalNumber(data.lengthCm, "Délka", errors, { max: PRODUCT_LIMITS.catch.lengthCm });
  parseOptionalNumber(data.girthCm, "Obvod", errors, { max: PRODUCT_LIMITS.catch.girthCm });
  parseOptionalNumber(data.fightDurationMin, "Délka boje", errors, { max: PRODUCT_LIMITS.catch.fightDurationMin });
  parseOptionalNumber(data.depthM, "Hloubka", errors, { max: PRODUCT_LIMITS.catch.depthM });
  parseOptionalNumber(data.waterNumber, "Číslo revíru", errors, { max: PRODUCT_LIMITS.catch.waterNumber });
  parseOptionalNumber(data.conditions?.airTempC, "Teplota vzduchu", errors, PRODUCT_LIMITS.catch.airTempC);
  parseOptionalNumber(data.conditions?.waterTempC, "Teplota vody", errors, PRODUCT_LIMITS.catch.waterTempC);
  parseOptionalNumber(data.conditions?.pressureHpa, "Tlak", errors, PRODUCT_LIMITS.catch.pressureHpa);
  parseOptionalNumber(data.conditions?.windKmh, "Rychlost větru", errors, { max: PRODUCT_LIMITS.catch.windKmh });
  for (const [field, [min, max]] of Object.entries(ENVIRONMENT_FIELDS)) {
    parseOptionalNumber(data.environmentConditions?.[field], ENVIRONMENT_LABELS[field][0], errors, { min, max });
  }
  if (String(data.environmentConditions?.weatherCode ?? "").trim()
    && !Number.isInteger(Number(String(data.environmentConditions.weatherCode).replace(",", ".")))) errors[ENVIRONMENT_LABELS.weatherCode[0]] = "Kód počasí musí být celé číslo.";
  return errors;
}

export function createCatchRecord(data, species, methods, existing = null, baitCatalog = []) {
  const allowedPhotoCount = existing ? Math.max(MAX_PHOTOS_PER_CATCH, existing.photos?.length ?? 0) : MAX_PHOTOS_PER_CATCH;
  if (!Array.isArray(data.photos) || data.photos.length > allowedPhotoCount || data.photos.length > MAX_LEGACY_PHOTOS_PER_CATCH) {
    throw new RangeError(`Úlovek může mít nejvýše ${allowedPhotoCount} fotografií.`);
  }
  const numeric = (value) => {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const parsed = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const conditionData = data.conditions ?? {};
  const conditions = {
    ...(existing?.conditions ?? {}),
    airTempC: numeric(conditionData.airTempC ?? ""),
    waterTempC: numeric(conditionData.waterTempC ?? ""),
    pressureHpa: numeric(conditionData.pressureHpa ?? ""),
    windKmh: numeric(conditionData.windKmh ?? ""),
    moonPhase: conditionData.moonPhase || null,
  };
  for (const [key, value] of Object.entries(conditions)) {
    if (value === null || value === undefined || value === "") delete conditions[key];
  }
  const conditionSources = normalizeConditionSources(data.conditionSources ?? existing?.conditionSources, conditions);
  if (existing) {
    for (const field of CONDITION_SOURCE_FIELDS) {
      if ((conditions[field] ?? null) !== (existing.conditions?.[field] ?? null)) conditionSources[field] = "manual";
    }
  }
  const now = new Date().toISOString();
  const selectedInstant = new Date(`${data.catchDate}T${data.catchTime || "12:00"}`).toISOString();
  const caughtAt = existing && Math.floor(Date.parse(existing.caughtAt) / 60000) === Math.floor(Date.parse(selectedInstant) / 60000)
    ? existing.caughtAt : selectedInstant;
  let quickCatch = existing?.quickCatch;
  if (quickCatch) {
    const environment = normalizeCatchEnvironment(quickCatch.environment) ?? { conditions: {} };
    const provenance = { ...quickCatch.provenance };
    for (const field of Object.keys(ENVIRONMENT_FIELDS)) {
      if (!Object.hasOwn(data.environmentConditions ?? {}, field)) continue;
      const value = numeric(data.environmentConditions[field]);
      if (value !== (environment.conditions[field] ?? null)) provenance[field] = "manual";
      if (value === null) delete environment.conditions[field]; else environment.conditions[field] = value;
    }
    const coordinates = normalizeCoordinates(data.coordinates) ?? parseCoordinateText(data.gpsLocation);
    const contextChanged = caughtAt !== existing.caughtAt || JSON.stringify(coordinates) !== JSON.stringify(existing.coordinates ?? null);
    if (contextChanged && provenance.waterTempC === "active_trip" && conditionSources.waterTempC === "auto"
      && !isTripWaterTemperatureRelevant(quickCatch.tripSnapshot?.waterTemperatureMeasurement, caughtAt)) {
      delete conditions.waterTempC; delete conditionSources.waterTempC; delete provenance.waterTempC;
    }
    if (contextChanged) {
      delete environment.weather;
      for (const field of Object.keys(environment.conditions)) if (provenance[field] !== "manual") delete environment.conditions[field];
      for (const field of ["airTempC", "pressureHpa", "windKmh"]) {
        if (conditionSources[field] !== "auto") continue;
        delete conditions[field]; delete conditionSources[field]; delete provenance[field];
      }
      if (conditionSources.moonPhase === "auto") conditions.moonPhase = calculateMoonPhase(data.catchDate, data.catchTime);
    }
    const astronomy = calculateCatchAstronomy(caughtAt, coordinates);
    if (astronomy) { environment.astronomy = astronomy; provenance.astronomy = "derived"; }
    else delete environment.astronomy;
    quickCatch = { ...quickCatch, provenance,
      ...(contextChanged ? { enrichment: { ...quickCatch.enrichment, weather: { status: "pending", attempts: 0, nextAttemptAt: null } } } : {}),
      ...(normalizeCatchEnvironment(environment) ? { environment: normalizeCatchEnvironment(environment) } : { environment: null }) };
  }
  const method = methods.find((item) => item.key === data.fishingMethod);
  const existingMethod = existing?.method?.key === data.fishingMethod ? existing.method : null;
  const existingBaits = new Map((existing?.baits ?? []).map((bait) => [bait.key, bait]));
  const photos = data.photos.map((photo) => {
    const storedPhoto = { ...photo };
    const file = storedPhoto.file;
    delete storedPhoto.previewUrl;
    delete storedPhoto.file;
    const frame = hasCustomPhotoFrame(photo) ? normalizePhotoFrame(photo) : {};
    return {
      ...storedPhoto,
      ...frame,
      id: photo.id ?? crypto.randomUUID(),
      blob: photo.blob ?? file,
      name: photo.name ?? file?.name ?? "fotografie",
      type: photo.type ?? file?.type ?? "image/jpeg",
        cloud: photo.cloud ?? { state: "localOnly", provider: null, objectKey: null, sha256: null },
    };
  });
  const locationEvidence = normalizeLocationEvidence(Object.hasOwn(data, "locationEvidence") ? data.locationEvidence : existing?.locationEvidence);
  const record = {
    ...(existing ?? {}),
    ...(quickCatch ? { quickCatch } : {}),
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
    weightSource: data.weightSource === "estimated" ? "estimated" : "manual",
    lengthCm: numeric(data.lengthCm),
    girthCm: numeric(data.girthCm),
    fightMinutes: numeric(data.fightDurationMin),
    locationName: data.locationName.trim(),
    waterId: data.waterId || null,
    waterNumber: numeric(data.waterNumber),
    gpsLocation: data.gpsLocation.trim(),
    coordinates: normalizeCoordinates(data.coordinates) ?? parseCoordinateText(data.gpsLocation),
    ...(locationEvidence ? { locationEvidence } : (Object.hasOwn(data, "locationEvidence") || existing?.locationEvidence) ? { locationEvidence: null } : {}),
    waterDepthM: numeric(data.depthM),
    bottomType: data.bottomType || null,
    conditions: Object.keys(conditions).length ? conditions : null,
    conditionSources,
    caughtAt,
    catchDateTimeSource: ["manual", "photo-exif"].includes(data.catchDateTimeSource)
      ? data.catchDateTimeSource
      : existing?.catchDateTimeSource ?? "default",
    gpsSource: ["manual", "manual-map", "photo-exif", "live-gps"].includes(data.gpsSource)
      ? data.gpsSource
      : existing?.gpsSource ?? "default",
    tripId: data.tripId || null,
    method: method ? { key: method.key, label: method.label, isCustom: false } : existingMethod,
    baits: data.baits.map((key) => existingBaits.get(key) ?? ({ key, label: baitCatalog.find((bait) => bait.key === key)?.label ?? key, isCustom: !baitCatalog.some((bait) => bait.key === key) })),
    result: data.resultKey || "unspecified",
    photos,
    primaryPhotoId: normalizePrimaryPhotoId(photos, data.primaryPhotoId ?? existing?.primaryPhotoId),
    notes: data.notes.trim(),
    isFavorite: Boolean(data.isFavorite),
    privacy: normalizeCatchPrivacy(data.privacy ?? existing?.privacy),
    ...(data.verification || existing?.verification ? { verification: normalizeCatchVerification(data.verification ?? existing?.verification) } : {}),
  };
  if (!quickCatch) {
    const environment = normalizeCatchEnvironment(existing?.environment) ?? { conditions: {} };
    for (const field of Object.keys(ENVIRONMENT_FIELDS)) {
      if (!Object.hasOwn(data.environmentConditions ?? {}, field)) continue;
      const value = numeric(data.environmentConditions[field]);
      if (value === null) delete environment.conditions[field]; else environment.conditions[field] = value;
    }
    const astronomy = calculateCatchAstronomy(caughtAt, record.coordinates);
    if (astronomy) environment.astronomy = astronomy; else delete environment.astronomy;
    const normalized = normalizeCatchEnvironment(environment);
    if (normalized) record.environment = normalized;
    else if (existing && Object.hasOwn(existing, "environment")) record.environment = null;
    else delete record.environment;
  }
  if (existing && record.quickCatch) {
    const provenance = { ...record.quickCatch.provenance };
    for (const field of ["caughtAt", "coordinates", "tripId", "locationName", "waterId", "waterNumber", "method", "baits", "speciesKey",
      "lengthCm", "weightKg", "girthCm", "fightMinutes", "waterDepthM", "bottomType", "notes", "result"]) {
      if (JSON.stringify(record[field] ?? null) !== JSON.stringify(existing[field] ?? null)) provenance[field] = "manual";
    }
    if (data.gpsSource === "manual" && existing.gpsSource !== "manual") provenance.coordinates = "manual";
    for (const field of CONDITION_SOURCE_FIELDS) if (conditionSources[field] === "manual") provenance[field] = "manual";
    record.quickCatch = { ...record.quickCatch, provenance };
  }
  return record;
}

export function catchToForm(record) {
  const date = new Date(record.caughtAt);
  const pad = (value) => String(value).padStart(2, "0");
  const number = (value) => value ?? "";
  const shouldEstimate = record.weightSource === "estimated" || !Number.isFinite(record.weightKg);
  const estimate = shouldEstimate ? estimateFishWeight(record.speciesKey, record.lengthCm) : null;
  const conditions = {
    airTempC: record.conditions?.airTempC ?? record.conditions?.airTemperatureC ?? "",
    waterTempC: record.conditions?.waterTempC ?? record.conditions?.waterTemperatureC ?? "",
    pressureHpa: record.conditions?.pressureHpa ?? "",
    windKmh: record.conditions?.windKmh ?? "",
    moonPhase: record.conditions?.moonPhase ?? "",
  };
  return {
    weightKg: shouldEstimate && estimate !== null ? formatEstimatedWeight(estimate) : number(record.weightKg), lengthCm: number(record.lengthCm),
    weightSource: shouldEstimate ? "estimated" : "manual",
    girthCm: number(record.girthCm), fightDurationMin: number(record.fightMinutes),
    locationName: record.locationName ?? "", waterId: record.waterId ?? "", waterNumber: number(record.waterNumber),
    catchDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    catchTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    catchDateTimeSource: record.catchDateTimeSource ?? "manual",
    gpsLocation: record.gpsLocation ?? "", coordinates: record.coordinates ?? null, depthM: number(record.waterDepthM),
    gpsSource: record.gpsSource ?? ((record.coordinates || record.gpsLocation) ? "manual" : "default"),
    bottomType: record.bottomType ?? "", speciesKey: record.speciesKey,
    resultKey: record.result ?? "unspecified", fishingMethod: record.method?.key ?? "",
    conditions,
    environmentConditions: { ...(normalizeCatchEnvironment(record.quickCatch?.environment ?? record.environment)?.conditions ?? {}) },
    conditionSources: normalizeConditionSources(record.conditionSources, conditions),
    photos: record.photos ?? [], baits: (record.baits ?? []).map((bait) => bait.key),
    primaryPhotoId: normalizePrimaryPhotoId(record.photos ?? [], record.primaryPhotoId),
    notes: record.notes ?? "", isFavorite: Boolean(record.isFavorite), tripId: record.tripId ?? "",
    privacy: normalizeCatchPrivacy(record.privacy),
    locationEvidence: normalizeLocationEvidence(record.locationEvidence),
    ...(record.verification ? { verification: normalizeCatchVerification(record.verification) } : {}),
  };
}
