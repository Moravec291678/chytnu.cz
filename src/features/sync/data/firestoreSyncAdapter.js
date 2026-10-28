import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  startAfter,
  where,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { firebaseAuth, getLocalFirebaseApp } from "../../auth/data/firebaseAuth.js";
import { getBackendConfiguration } from "../../auth/data/backendConfig.js";
import { SyncPortError } from "./syncPort.js";
import { normalizeCatchPrivacy } from "../../privacy/data/privacyModel.js";
import { normalizeCatchVerification, normalizeLocationEvidence } from "../../catches/data/catchVerification.js";

const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8080;
const GLOBAL_CONNECTIONS = Symbol.for("chytnucz.firebaseEmulatorConnections");

function getConfiguredFirestore() {
  const app = getLocalFirebaseApp();
  globalThis[GLOBAL_CONNECTIONS] ??= new Set();
  const db = getFirestore(app);
  const key = `firestore:${app.name}`;
  if (getBackendConfiguration().mode === "emulator" && !globalThis[GLOBAL_CONNECTIONS].has(key)) {
    connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORT);
    globalThis[GLOBAL_CONNECTIONS].add(key);
  }
  return db;
}

function requireActiveOwner(ownerId, getCurrentUserId) {
  if (!ownerId || getCurrentUserId() !== ownerId) {
    throw new SyncPortError("permission_denied", "Přihlášený účet se změnil. Synchronizace byla zastavena.");
  }
}

export function normalizeFirebaseError(error) {
  if (error instanceof SyncPortError) return error;
  const providerCode = String(error?.code ?? "").toLowerCase();
  const errorOptions = { cause: error, providerCode, sourceName: error?.name };
  if (providerCode.includes("unauthenticated")) {
    return new SyncPortError("unauthenticated", "Přihlášení vypršelo.", { ...errorOptions, retryable: false });
  }
  if (providerCode.includes("permission-denied")) {
    return new SyncPortError("permission_denied", "Účet už nemá oprávnění synchronizovat tyto záznamy.", { ...errorOptions, retryable: false });
  }
  if (providerCode.includes("invalid-argument") || providerCode.includes("failed-precondition")) {
    return new SyncPortError("rules_schema_rejection", "Server odmítl strukturu synchronizovaného záznamu.", { ...errorOptions, retryable: false });
  }
  if (["unavailable", "deadline-exceeded", "aborted", "internal", "resource-exhausted", "network-request-failed", "cancelled"]
    .some((code) => providerCode.includes(code))) {
    return new SyncPortError("unavailable", "Synchronizační server není dostupný.", { ...errorOptions, retryable: true });
  }
  return new SyncPortError("unknown", "Synchronizaci se nepodařilo dokončit.", { ...errorOptions, retryable: true });
}

function entityRef(db, ownerId, entityType, entityId) {
  const collectionName = entityType === "catch" ? "catches" : entityType === "trip" ? "trips" : "waters";
  return doc(db, "users", ownerId, collectionName, entityId);
}

function catchPhotoCollectionRef(db, ownerId, catchId) {
  return collection(db, "users", ownerId, "catches", catchId, "photos");
}

function catchPhotoRef(db, ownerId, catchId, photoId) {
  return doc(catchPhotoCollectionRef(db, ownerId, catchId), photoId);
}

function requireValue(value, fallback) {
  return value === undefined ? fallback : value;
}

const CONDITION_FIELDS = [
  "airTempC",
  "waterTempC",
  "pressureHpa",
  "windKmh",
  "moonPhase",
  "airTemperatureC",
  "waterTemperatureC",
  "weather",
  "windDirection",
  "pressureTrend",
];
const CONDITION_SOURCE_FIELDS = ["airTempC", "waterTempC", "pressureHpa", "windKmh", "moonPhase"];

function serializeConditions(conditions) {
  if (conditions == null) return null;
  return Object.fromEntries(
    Object.entries(conditions).filter(([key, value]) => CONDITION_FIELDS.includes(key) && value !== undefined),
  );
}

function serializeConditionSources(sources) {
  if (sources == null) return null;
  return Object.fromEntries(Object.entries(sources).filter(([field, source]) => CONDITION_SOURCE_FIELDS.includes(field) && ["auto", "manual"].includes(source)));
}

export function toRemoteRecord(entityType, record, ownerId) {
  if (!record || record.id === undefined || record.ownerId !== ownerId) {
    throw new SyncPortError("permission_denied", "Záznam nemá ověřeného vlastníka.");
  }
  const common = {
    schemaVersion: 1,
    id: record.id,
    ownerId,
    createdAt: requireValue(record.createdAt, new Date().toISOString()),
    updatedAt: requireValue(record.updatedAt, new Date().toISOString()),
  };
  if (entityType === "trip") {
    return {
      ...common,
      title: requireValue(record.title, ""),
      locationName: requireValue(record.locationName, ""),
      methodKey: requireValue(record.methodKey, null),
      startedAt: requireValue(record.startedAt, record.createdAt),
      endedAt: requireValue(record.endedAt, null),
    };
  }
  if (entityType === "water") {
    return {
      ...common,
      name: requireValue(record.name, ""),
      waterNumber: requireValue(record.waterNumber, null),
      type: requireValue(record.type, "Rybník"),
      area: requireValue(record.area, null),
      coordinates: requireValue(record.coordinates, null),
      notes: requireValue(record.notes, ""),
      targetFish: requireValue(record.targetFish, []),
      isFavorite: Boolean(record.isFavorite),
      moderationStatus: requireValue(record.moderationStatus, "pending"),
    };
  }
  const photos = (record.photos ?? []).map((photo) => ({
    id: photo.id,
    name: photo.name ?? "fotografie",
    type: photo.type ?? photo.blob?.type ?? "image/jpeg",
    size: photo.blob?.size ?? photo.size ?? 0,
    focalX: Number.isFinite(photo.focalX) ? photo.focalX : 0.5,
    focalY: Number.isFinite(photo.focalY) ? photo.focalY : 0.5,
    zoom: Number.isFinite(photo.zoom) ? photo.zoom : 1,
    cloud: photo.cloud?.state === "synced" && typeof photo.cloud.provider === "string"
      && typeof photo.cloud.objectKey === "string" && typeof photo.cloud.sha256 === "string"
      ? { state: "synced", provider: photo.cloud.provider, objectKey: photo.cloud.objectKey, sha256: photo.cloud.sha256 }
      : { state: "localOnly", provider: null, objectKey: null, sha256: null },
  }));
  if (photos.length > 10 || photos.some((photo) => typeof photo.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(photo.id))
    || new Set(photos.map((photo) => photo.id)).size !== photos.length) {
    throw new SyncPortError("invalid_request", "Fotografie úlovku nemají platná nebo jedinečná ID, případně překračují limit 10 položek.");
  }
  const primaryPhotoId = photos.some((photo) => photo.id === record.primaryPhotoId)
    ? record.primaryPhotoId
    : photos[0]?.id ?? null;
  return {
    ...common,
    caughtAt: requireValue(record.caughtAt, record.createdAt),
    catchDateTimeSource: ["manual", "photo-exif"].includes(record.catchDateTimeSource) ? record.catchDateTimeSource : "default",
    gpsSource: ["manual", "photo-exif", "live-gps"].includes(record.gpsSource) ? record.gpsSource : "default",
    species: requireValue(record.species, ""),
    speciesKey: requireValue(record.speciesKey, ""),
    speciesLatin: requireValue(record.speciesLatin, null),
    weightKg: requireValue(record.weightKg, null),
    weightSource: record.weightSource === "estimated" ? "estimated" : "manual",
    lengthCm: requireValue(record.lengthCm, null),
    girthCm: requireValue(record.girthCm, null),
    fightMinutes: requireValue(record.fightMinutes, null),
    locationName: requireValue(record.locationName, ""),
    waterNumber: requireValue(record.waterNumber, null),
    waterId: requireValue(record.waterId, null),
    gpsLocation: requireValue(record.gpsLocation, ""),
    coordinates: requireValue(record.coordinates, null),
    ...(record.locationEvidence ? { locationEvidence: normalizeLocationEvidence(record.locationEvidence) } : {}),
    waterDepthM: requireValue(record.waterDepthM, null),
    bottomType: requireValue(record.bottomType, null),
    conditions: serializeConditions(record.conditions),
    conditionSources: serializeConditionSources(record.conditionSources),
    tripId: requireValue(record.tripId, null),
    method: requireValue(record.method, null),
    baits: requireValue(record.baits, []),
    result: requireValue(record.result, "unspecified"),
    photos,
    photoRefs: Object.fromEntries(photos.map((photo) => [photo.id, true])),
    primaryPhotoId,
    notes: requireValue(record.notes, ""),
    isFavorite: Boolean(record.isFavorite),
    privacy: normalizeCatchPrivacy(record.privacy),
    ...(record.verification ? { verification: normalizeCatchVerification(record.verification) } : {}),
  };
}

function fromRemoteDocument(entityType, data, photos = undefined, photoMetadataError = null) {
  const record = { ...data };
  if (entityType === "catch") {
    const legacyPhotos = Array.isArray(record.photos) ? record.photos : [];
    record.photos = photos ?? legacyPhotos;
    record.primaryPhotoId = record.primaryPhotoId ?? legacyPhotos[0]?.id ?? record.photos[0]?.id ?? null;
    delete record.photoIds;
    delete record.photoRefs;
  }
  const serverRevision = record.serverRevision;
  const lastOperationId = record.lastOperationId;
  const clientLocalRevision = record.clientLocalRevision;
  const operationDigest = record.operationDigest;
  const deleted = record.deleted;
  const deletedAt = record.deletedAt;
  const photoState = record.photoState;
  delete record.serverRevision;
  delete record.syncSequence;
  delete record.lastOperationId;
  delete record.clientLocalRevision;
  delete record.operationDigest;
  delete record.lastReceiptId;
  delete record.entityType;
  delete record.deleted;
  delete record.deletedAt;
  delete record.photoState;
  return {
    record: entityType === "catch" ? { ...record, photos: record.photos ?? [] } : record,
    revision: serverRevision,
    lastOperationId,
    clientLocalRevision,
    operationDigest,
    deleted: Boolean(deleted),
    deletedAt: deletedAt ?? null,
    photoState: photoState ?? "none",
    photoMetadataError,
  };
}

const PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function sanitizedRemotePhoto(photo, photoId, ownerId, catchId) {
  if (!photo || typeof photo !== "object" || Array.isArray(photo) || !PHOTO_ID_PATTERN.test(photoId)
    || photo.id !== photoId) return null;
  if (photo.deleted === true) return null;
  const type = PHOTO_TYPES.has(photo.type) ? photo.type : "image/jpeg";
  const size = Number.isSafeInteger(photo.size) && photo.size >= 0 && photo.size <= 10 * 1024 * 1024 ? photo.size : 0;
  const focalX = Number.isFinite(photo.focalX) && photo.focalX >= 0 && photo.focalX <= 1 ? photo.focalX : 0.5;
  const focalY = Number.isFinite(photo.focalY) && photo.focalY >= 0 && photo.focalY <= 1 ? photo.focalY : 0.5;
  const zoom = Number.isFinite(photo.zoom) && photo.zoom >= 1 && photo.zoom <= 2 ? photo.zoom : 1;
  const objectKey = `users/${ownerId}/catches/${catchId}/photos/${photoId}/original`;
  const cloud = photo.cloud;
  const localOnly = !cloud || cloud.state === "localOnly";
  const validSyncedCloud = cloud?.state === "synced"
    && typeof cloud.provider === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(cloud.provider)
    && cloud.objectKey === objectKey && typeof cloud.sha256 === "string" && /^[a-f0-9]{64}$/.test(cloud.sha256);
  const structurallyValid = PHOTO_TYPES.has(photo.type)
    && Number.isSafeInteger(photo.size) && photo.size >= 0 && photo.size <= 10 * 1024 * 1024
    && (localOnly || validSyncedCloud);
  return {
    id: photoId,
    name: typeof photo.name === "string" && photo.name.length <= 255 ? photo.name : "fotografie",
    type,
    size,
    focalX,
    focalY,
    zoom,
    ...(Number.isSafeInteger(photo.sortIndex) ? { sortIndex: photo.sortIndex } : {}),
    cloud: structurallyValid && validSyncedCloud
      ? { state: "synced", provider: cloud.provider, objectKey: cloud.objectKey, sha256: cloud.sha256 }
      : structurallyValid ? { state: "localOnly", provider: null, objectKey: null, sha256: null }
        : { state: "unavailable", provider: null, objectKey: null, sha256: null },
    metadataInvalid: !structurallyValid,
  };
}

export function sanitizeRemotePhotoMetadata(photos, ownerId, catchId, onDiagnostic = () => {}) {
  if (!Array.isArray(photos)) return [];
  const seen = new Set();
  const sanitized = [];
  for (const photo of photos) {
    const photoId = typeof photo?.id === "string" ? photo.id : "";
    const validId = PHOTO_ID_PATTERN.test(photoId);
    if (!validId || seen.has(photoId)) {
      onDiagnostic({ event: "invalid-photo-metadata", code: validId ? "duplicate_photo_id" : "invalid_photo_id",
        entityType: "catch", operation: "pull", retryable: false,
        syncStage: "pull:photos", firestoreStage: "validate-photo-metadata" });
      continue;
    }
    seen.add(photoId);
    const result = sanitizedRemotePhoto(photo, photoId, ownerId, catchId);
    if (!result) {
      onDiagnostic({ event: "invalid-photo-metadata", code: "invalid_photo_record", entityType: "catch",
        operation: "pull", retryable: false, syncStage: "pull:photos", firestoreStage: "validate-photo-metadata" });
      continue;
    }
    if (result.metadataInvalid) {
      onDiagnostic({ event: "invalid-photo-metadata", code: "invalid_photo_record", entityType: "catch",
        operation: "pull", retryable: false, syncStage: "pull:photos", firestoreStage: "validate-photo-metadata" });
    }
    delete result.metadataInvalid;
    sanitized.push(result);
  }
  return sanitized;
}

function toRemotePhotoDocument(photo) {
  return {
    id: photo.id,
    name: photo.name,
    type: photo.type,
    size: photo.size,
    focalX: photo.focalX,
    focalY: photo.focalY,
    zoom: photo.zoom,
    sortIndex: photo.sortIndex,
    deleted: false,
    deletedAt: null,
    cloud: photo.cloud ?? { state: "localOnly", provider: null, objectKey: null, sha256: null },
  };
}

function photoTombstone(photo, nowValue) {
  return { ...photo, deleted: true, deletedAt: nowValue };
}

async function readCatchPhotos(db, ownerId, catchId, data, onDiagnostic) {
  if (Array.isArray(data.photos)) return { photos: sanitizeRemotePhotoMetadata(data.photos, ownerId, catchId, onDiagnostic), error: null };
  const reportInvalidRefs = () => onDiagnostic({ event: "invalid-photo-metadata", code: "invalid_photo_refs",
    entityType: "catch", operation: "pull", retryable: false,
    syncStage: "pull:photos", firestoreStage: "validate-photo-refs" });
  let ids = [];
  if (data.photoRefs !== undefined) {
    if (!data.photoRefs || typeof data.photoRefs !== "object" || Array.isArray(data.photoRefs)) reportInvalidRefs();
    else {
      const refs = Object.entries(data.photoRefs);
      const validRefs = refs.filter(([photoId, enabled]) => /^[A-Za-z0-9_-]{1,128}$/.test(photoId) && enabled === true);
      if (validRefs.length !== refs.length) reportInvalidRefs();
      ids = validRefs.map(([photoId]) => photoId);
    }
  } else if (Array.isArray(data.photoIds)) {
    const validIds = data.photoIds.filter((photoId) => typeof photoId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(photoId));
    if (validIds.length !== data.photoIds.length || new Set(validIds).size !== validIds.length) reportInvalidRefs();
    ids = [...new Set(validIds)];
  }
  if (data.primaryPhotoId !== undefined && data.primaryPhotoId !== null
    && (typeof data.primaryPhotoId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(data.primaryPhotoId)
      || !ids.includes(data.primaryPhotoId))) reportInvalidRefs();
  let snapshots;
  try { snapshots = await Promise.all(ids.map((photoId) => getDoc(catchPhotoRef(db, ownerId, catchId, photoId)))); }
  catch (error) {
    const normalized = normalizeFirebaseError(error);
    return { photos: [], error: normalized };
  }
  const photos = snapshots.flatMap((snapshot, index) => {
    if (!snapshot.exists()) return [];
    const photo = snapshot.data();
    if (photo.deleted) return [];
    return [{ ...photo, id: photo.id ?? ids[index] }];
  });
  return { photos: sanitizeRemotePhotoMetadata(photos, ownerId, catchId, onDiagnostic)
    .sort((left, right) => (left.sortIndex ?? 0) - (right.sortIndex ?? 0) || left.id.localeCompare(right.id))
    .map((photo) => {
      const localPhoto = { ...photo };
      delete localPhoto.sortIndex;
      return localPhoto;
    }), error: null };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digest(value) {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const result = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function receiptId(operationId, localRevision) {
  return `${operationId}_${localRevision}`;
}

function isDeletedTombstone(record) {
  return Boolean(record?.deleted);
}

function minimalTombstone(entityType, ownerId, entityId, now) {
  const common = {
    schemaVersion: 1,
    id: entityId,
    ownerId,
    deleted: true,
    deletedAt: now,
  };
  return entityType === "trip"
    ? { ...common, entityType: "trip" }
    : entityType === "water"
      ? { ...common, entityType: "water" }
      : { ...common, entityType: "catch" };
}

function makePortError(error, firestoreStage) {
  const normalized = normalizeFirebaseError(error);
  normalized.firestoreStage ??= firestoreStage;
  throw normalized;
}

export function createFirestoreSyncAdapter({ now = () => new Date().toISOString(), db: suppliedDb, getCurrentUserId, onDiagnostic = () => {} } = {}) {
  const db = suppliedDb ?? getConfiguredFirestore();
  const currentUserId = getCurrentUserId ?? (() => firebaseAuth.currentUserId());

  return {
    async read({ ownerId, entityType, entityId }) {
      requireActiveOwner(ownerId, currentUserId);
      let firestoreStage = entityType === "catch" ? "get-catch" : `get-${entityType}`;
      try {
        const snapshot = await getDoc(entityRef(db, ownerId, entityType, entityId));
        if (!snapshot.exists()) return null;
        const data = snapshot.data();
        let photos;
        let photoMetadataError = null;
        if (entityType === "catch" && !data.deleted) {
          firestoreStage = "get-catch-photo-metadata";
          const photoResult = await readCatchPhotos(db, ownerId, entityId, data, onDiagnostic);
          photos = photoResult.photos;
          photoMetadataError = photoResult.error;
        }
        const remote = fromRemoteDocument(entityType, data, photos, photoMetadataError);
        return remote.deleted
          ? { ...remote, entityType, entityId }
          : remote;
      } catch (error) { makePortError(error, firestoreStage); }
    },

    async write({ ownerId, entityType, entityId, record, expectedRevision, operationId, localRevision }) {
      requireActiveOwner(ownerId, currentUserId);
      const projected = toRemoteRecord(entityType, record, ownerId);
      const photos = entityType === "catch" ? projected.photos : [];
      const parentContent = { ...projected };
      delete parentContent.photos;
      const requestDigest = await digest({ entityType, entityId, ownerId, operationId, localRevision, operation: "upsert", record: projected });
      const ref = entityRef(db, ownerId, entityType, entityId);
      const receipt = doc(db, "users", ownerId, "syncOperations", receiptId(operationId, localRevision));
      const stateRef = doc(db, "users", ownerId, "sync", "state");
      const changeRef = doc(db, "users", ownerId, "syncChanges", receiptId(operationId, localRevision));
      let firestoreStage = "read-sync-transaction-records";
      try {
        const result = await runTransaction(db, async (transaction) => {
          requireActiveOwner(ownerId, currentUserId);
          const [receiptSnapshot, currentSnapshot, stateSnapshot] = await Promise.all([
            transaction.get(receipt), transaction.get(ref), transaction.get(stateRef),
          ]);
          if (receiptSnapshot.exists()) {
            const previous = receiptSnapshot.data();
            if (previous.operationDigest !== requestDigest) throw new SyncPortError("conflict", "Stejné ID operace obsahuje jinou změnu.");
            return { revision: previous.serverRevision, operationId, cursor: String(previous.sequence) };
          }

          const current = currentSnapshot.exists() ? currentSnapshot.data() : null;
          const currentRevision = current?.serverRevision ?? null;
          const continuation = current?.lastOperationId === operationId
            && Number.isSafeInteger(current?.clientLocalRevision)
            && localRevision > current.clientLocalRevision;
          if (!continuation && currentRevision !== expectedRevision) {
            throw new SyncPortError("conflict", "Vzdálený záznam se od poslední synchronizace změnil.");
          }
          if (current && isDeletedTombstone(current)) {
            throw new SyncPortError("conflict", "Záznam byl na jiném zařízení smazán.");
          }
          if (continuation && localRevision <= current.clientLocalRevision) {
            throw new SyncPortError("conflict", "Starší lokální změna nemůže přepsat novější stav.");
          }

          const previousPhotoIds = entityType === "catch"
            ? (current?.photoRefs && typeof current.photoRefs === "object"
              ? Object.keys(current.photoRefs)
              : Array.isArray(current?.photoIds) ? current.photoIds : (current?.photos ?? []).map((photo) => photo.id).filter(Boolean))
            : [];
          const photoIdsToRead = [...new Set([...previousPhotoIds, ...photos.map((photo) => photo.id)])];
          const photoRefs = photoIdsToRead.map((photoId) => catchPhotoRef(db, ownerId, entityId, photoId));
          firestoreStage = entityType === "catch" ? "read-catch-photo-documents" : "stage-entity-write";
          const photoSnapshots = await Promise.all(photoRefs.map((photoRef) => transaction.get(photoRef)));
          const currentPhotos = new Map(photoIdsToRead.map((photoId, index) => [photoId, photoSnapshots[index]]));

          const revision = (currentRevision ?? 0) + 1;
          const sequence = (stateSnapshot.exists() ? stateSnapshot.data().cursor : 0) + 1;
          const receiptDocument = {
            ownerId, receiptId: receipt.id, operationId, entityType, entityId,
            serverRevision: revision, sequence, localRevision, operationDigest: requestDigest,
            kind: "upsert", createdAt: now(),
          };
          const remoteDocument = {
            ...parentContent,
            entityType,
            serverRevision: revision,
            syncSequence: sequence,
            lastOperationId: operationId,
            clientLocalRevision: localRevision,
            operationDigest: requestDigest,
            lastReceiptId: receipt.id,
            deleted: false,
            deletedAt: null,
            photoState: entityType === "catch" && photos.length > 0 ? "metadata-only" : "none",
          };
          firestoreStage = `commit-${entityType}-${current ? "update" : "create"}`;
          if (entityType === "catch") {
            const desiredPhotoIds = new Set(photos.map((photo) => photo.id));
            for (const [sortIndex, photo] of photos.entries()) {
                transaction.set(catchPhotoRef(db, ownerId, entityId, photo.id), toRemotePhotoDocument({ ...photo, sortIndex }));
            }
            for (const previousPhotoId of previousPhotoIds) {
              if (desiredPhotoIds.has(previousPhotoId)) continue;
              const previousSnapshot = currentPhotos.get(previousPhotoId);
              if (!previousSnapshot?.exists() || previousSnapshot.data().deleted) continue;
              transaction.set(catchPhotoRef(db, ownerId, entityId, previousPhotoId), photoTombstone(previousSnapshot.data(), now()));
            }
          }
          transaction.set(ref, remoteDocument);
          transaction.set(receipt, receiptDocument);
          transaction.set(changeRef, receiptDocument);
          transaction.set(stateRef, { ownerId, cursor: sequence, lastReceiptId: receipt.id });
          return { revision, operationId, cursor: String(sequence) };
        });
        requireActiveOwner(ownerId, currentUserId);
        return result;
      } catch (error) { makePortError(error, firestoreStage); }
    },

    async delete({ ownerId, entityType, entityId, expectedRevision, operationId, localRevision }) {
      requireActiveOwner(ownerId, currentUserId);
      const requestDigest = await digest({ ownerId, entityType, entityId, operationId, localRevision, operation: "delete" });
      const ref = entityRef(db, ownerId, entityType, entityId);
      const receipt = doc(db, "users", ownerId, "syncOperations", receiptId(operationId, localRevision));
      const stateRef = doc(db, "users", ownerId, "sync", "state");
      const changeRef = doc(db, "users", ownerId, "syncChanges", receiptId(operationId, localRevision));
      let firestoreStage = "read-sync-transaction-records";
      try {
        const result = await runTransaction(db, async (transaction) => {
          requireActiveOwner(ownerId, currentUserId);
          const [receiptSnapshot, currentSnapshot, stateSnapshot] = await Promise.all([
            transaction.get(receipt), transaction.get(ref), transaction.get(stateRef),
          ]);
          if (receiptSnapshot.exists()) {
            const previous = receiptSnapshot.data();
            if (previous.operationDigest !== requestDigest) throw new SyncPortError("conflict", "Stejné ID operace obsahuje jinou změnu.");
            return { revision: previous.serverRevision, operationId, cursor: String(previous.sequence) };
          }
          const current = currentSnapshot.exists() ? currentSnapshot.data() : null;
          const currentRevision = current?.serverRevision ?? null;
          const continuation = current?.lastOperationId === operationId
            && Number.isSafeInteger(current?.clientLocalRevision)
            && localRevision > current.clientLocalRevision;
          if (!continuation && currentRevision !== expectedRevision) {
            throw new SyncPortError("conflict", current ? "Vzdálený záznam se od poslední synchronizace změnil." : "Záznam nebyl nalezen.");
          }
          if (current && isDeletedTombstone(current)) {
            throw new SyncPortError("conflict", "Záznam byl již smazán.");
          }
          const photoIds = entityType === "catch"
            ? (current?.photoRefs && typeof current.photoRefs === "object" ? Object.keys(current.photoRefs) : [])
            : [];
          firestoreStage = entityType === "catch" ? "read-catch-photo-documents" : "stage-entity-delete";
          const photoRefs = photoIds.map((photoId) => catchPhotoRef(db, ownerId, entityId, photoId));
          const photoSnapshots = await Promise.all(photoRefs.map((photoRef) => transaction.get(photoRef)));
          const revision = (currentRevision ?? 0) + 1;
          const sequence = (stateSnapshot.exists() ? stateSnapshot.data().cursor : 0) + 1;
          const tombstone = {
            ...minimalTombstone(entityType, ownerId, entityId, now()),
            ownerId,
            id: entityId,
            entityType,
            deleted: true,
            deletedAt: now(),
            serverRevision: revision,
            syncSequence: sequence,
            lastOperationId: operationId,
            clientLocalRevision: localRevision,
            operationDigest: requestDigest,
            lastReceiptId: receipt.id,
            photoState: "none",
          };
          const receiptDocument = {
            ownerId, receiptId: receipt.id, operationId, entityType, entityId,
            serverRevision: revision, sequence, localRevision, operationDigest: requestDigest,
            kind: "delete", createdAt: now(),
          };
          firestoreStage = `commit-${entityType}-delete`;
          photoSnapshots.forEach((photoSnapshot, index) => {
            if (photoSnapshot.exists() && !photoSnapshot.data().deleted) {
              transaction.set(photoRefs[index], photoTombstone(photoSnapshot.data(), now()));
            }
          });
          transaction.set(ref, tombstone);
          transaction.set(receipt, receiptDocument);
          transaction.set(changeRef, receiptDocument);
          transaction.set(stateRef, { ownerId, cursor: sequence, lastReceiptId: receipt.id });
          return { revision, operationId, cursor: String(sequence) };
        });
        requireActiveOwner(ownerId, currentUserId);
        return result;
      } catch (error) { makePortError(error, firestoreStage); }
    },

    async list({ ownerId, entityType, cursor = null, limit: pageSize = 100 }) {
      requireActiveOwner(ownerId, currentUserId);
      let firestoreStage = `list-${entityType}s`;
      try {
      const collectionName = entityType === "catch" ? "catches" : entityType === "trip" ? "trips" : "waters";
      const base = collection(db, "users", ownerId, collectionName);
        const constraints = [orderBy(documentId()), limit(pageSize + 1)];
        if (cursor) constraints.splice(1, 0, startAfter(cursor));
        const snapshot = await getDocs(query(base, ...constraints));
        const hasMore = snapshot.size > pageSize;
        const documents = snapshot.docs.slice(0, pageSize);
        return {
          items: await Promise.all(documents.filter((item) => !item.data().deleted).map(async (item) => {
            const data = item.data();
            const photos = entityType === "catch" ? await readCatchPhotos(db, ownerId, item.id, data) : undefined;
            return { ...fromRemoteDocument(entityType, data, photos), entityType, entityId: item.id };
          })),
          cursor: documents.at(-1)?.id ?? cursor,
          hasMore,
        };
      } catch (error) { makePortError(error, firestoreStage); }
    },

    async delta({ ownerId, cursor = null, limit: pageSize = 100 }) {
      requireActiveOwner(ownerId, currentUserId);
      const after = cursor === null ? 0 : Number(cursor);
      if (!Number.isSafeInteger(after) || after < 0) throw new SyncPortError("invalid_request", "Neplatný synchronizační kurzor.");
      let firestoreStage = "query-sync-changes";
      try {
        const changes = collection(db, "users", ownerId, "syncChanges");
        const snapshot = await getDocs(query(changes, where("sequence", ">", after), orderBy("sequence"), limit(pageSize + 1)));
        const hasMore = snapshot.size > pageSize;
        const documents = snapshot.docs.slice(0, pageSize);
        firestoreStage = "get-sync-state";
        const state = await getDoc(doc(db, "users", ownerId, "sync", "state"));
        return {
          items: documents.map((item) => ({ ...item.data(), cursor: String(item.data().sequence) })),
          cursor: documents.length
            ? String(documents.at(-1).data().sequence)
            : String(state.exists() ? state.data().cursor : after),
          hasMore,
        };
      } catch (error) { makePortError(error, firestoreStage); }
    },
  };
}
