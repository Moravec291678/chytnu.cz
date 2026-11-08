import { createCatchRecord } from "./catchModel.js";
import { MAX_SOURCE_PHOTO_BYTES, preparePhotoForStorageAndUpload } from "./photoInput.js";
import { readPhotoCaptureMetadata } from "./photoCaptureMetadata.js";
import { buildInitialQuickCatchMetadata, buildQuickCatchContext, registerQuickCatchCameraCapture } from "./quickCatchEnrichment.js";
import { recordPhotoUploadTrace } from "./photoUploadTrace.js";
import { evaluateCatchVerification } from "./catchVerification.js";

const persistedOperations = new WeakSet();
export const wasQuickCatchPersisted = record => persistedOperations.has(record);
export function quickCaptureError(error) {
  if (error?.name === "QuotaExceededError") return "V zařízení není dost místa. Uvolni místo a zkus uložení znovu.";
  if (["InvalidStateError", "SecurityError"].includes(error?.name)) return "Místní úložiště není dostupné. Povol ukládání dat a zkus to znovu.";
  return error?.message || "Úlovek se nepodařilo uložit. Zkus to znovu.";
}

export function isIncompleteQuickCatch(record) {
  return record.captureMode === "quick" && (!record.speciesKey || !Number.isFinite(record.lengthCm));
}

export function createQuickCapture(inputSource = "camera", now = new Date()) {
  const capture = { id: crypto.randomUUID(), photoId: crypto.randomUUID(), capturedAt: now.toISOString(),
    inputSource, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    timezoneOffsetMinutes: now.getTimezoneOffset() };
  if (inputSource === "camera") registerQuickCatchCameraCapture(capture.id);
  return capture;
}

// One operation identity lives with the pending file, including failed-save retries.
export async function prepareQuickCatch(file, capture, { trip = null, methods = [], waters = [], baits = [],
  usedPhotoHashes = new Set(), prepare = preparePhotoForStorageAndUpload, readMetadata = readPhotoCaptureMetadata } = {}) {
  if (!(file instanceof Blob) || !file.size) throw new Error("Vyber platnou neprázdnou fotografii.");
  if (file.size > MAX_SOURCE_PHOTO_BYTES) throw new Error("Fotografii větší než 50 MB nelze zpracovat. Vyber menší soubor.");
  recordPhotoUploadTrace(capture.photoId, "photo_selected", { catchId: capture.id, sourceBytes: file.size, sourceMimeType: file.type });
  const [photo, metadata] = await Promise.all([prepare(file), readMetadata(file)]);
  recordPhotoUploadTrace(capture.photoId, "photo_prepared", { catchId: capture.id, preparedBytes: photo.size, preparedMimeType: photo.type });
  const automatic = buildInitialQuickCatchMetadata({ metadata, inputSource: capture.inputSource, capturedAt: capture.capturedAt });
  const timestamp = automatic.values.caughtAt;
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, "0");
  // An imported historical photograph must not inherit today's trip context.
  const tripContext = capture.inputSource === "gallery" && automatic.provenance.caughtAt !== "exif"
    ? { values: {}, provenance: {} } : buildQuickCatchContext({ trip, methods, waters, baits, capturedAt: timestamp });
  const form = { catchDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    catchTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`, locationName: tripContext.values.locationName || "",
    waterId: "", waterNumber: "",
    tripId: tripContext.values.tripId || "", fishingMethod: tripContext.values.method?.key || "",
    baits: [], gpsLocation: "", notes: "",
    photos: [{ id: capture.photoId, blob: photo.blob, type: photo.type, size: photo.size,
      name: "ulovek.jpg", contentSha256: photo.sha256, uploadReady: true,
      ...(metadata ? { captureMetadata: metadata } : {}) }],
    coordinates: automatic.values.coordinates ?? null, catchDateTimeSource: automatic.values.catchDateTimeSource,
    gpsSource: automatic.values.gpsSource ?? "default" };
  const record = createCatchRecord(form, { key: "", label: "Druh zatím neurčen" }, methods);
  record.id = capture.id;
  record.createdAt = capture.capturedAt;
  record.caughtAt = timestamp;
  Object.assign(record, automatic.values, tripContext.values);
  record.captureMode = "quick";
  record.verification = evaluateCatchVerification({ photos: record.photos, coordinates: record.coordinates,
    gpsSource: record.gpsSource, caughtAt: record.caughtAt, tripId: record.tripId,
    activeTripId: tripContext.values.tripId, trips: trip ? [trip] : [], usedPhotoHashes, now: new Date(capture.capturedAt) });
  record.quickCatch = { ...capture, ...(automatic.environment ? { environment: automatic.environment } : {}), provenance: { ...tripContext.provenance, ...automatic.provenance }, enrichment: {
    metadata: { status: "pending", attempts: 0, nextAttemptAt: null },
    weather: { status: capture.inputSource === "gallery" && automatic.provenance.caughtAt !== "exif" ? "unavailable" : "pending", attempts: 0, nextAttemptAt: null },
  } };
  delete record.quickCatch.id;
  delete record.quickCatch.photoId;
  return record;
}

export async function persistQuickCatch(record, scope, repository) {
  // A retry after an interrupted confirmation must not overwrite later edits.
  const existing = await repository.getMetadata(record.id, scope);
  if (!existing && persistedOperations.has(record)) throw new Error("Tento úlovek byl mezitím smazán. Uložení již nelze opakovat.");
  const stored = existing ?? await repository.put(record, scope);
  persistedOperations.add(record);
  try {
    await repository.verifyDurablePhoto(record.id, record.photos[0].id, record.photos[0].contentSha256, scope);
  } catch (error) {
    if (!repository.repairDurablePhoto) throw error;
    await repository.repairDurablePhoto(record.id, record.photos[0], scope);
    await repository.verifyDurablePhoto(record.id, record.photos[0].id, record.photos[0].contentSha256, scope);
  }
  recordPhotoUploadTrace(record.photos[0].id, "indexeddb_saved", { catchId: record.id, bytes: record.photos[0].size, mimeType: record.photos[0].type });
  return stored;
}
