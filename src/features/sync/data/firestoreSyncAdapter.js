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

function normalizeFirebaseError(error) {
  if (error instanceof SyncPortError) return error;
  const code = String(error?.code ?? "");
  if (code.includes("permission-denied") || code.includes("unauthenticated")) {
    return new SyncPortError("permission_denied", "Účet už nemá oprávnění synchronizovat tyto záznamy.", { cause: error });
  }
  if (code.includes("unavailable") || code.includes("deadline-exceeded") || code.includes("network-request-failed")) {
    return new SyncPortError("unavailable", "Synchronizační server není dostupný.", { cause: error });
  }
  return new SyncPortError("unknown", error?.message || "Synchronizaci se nepodařilo dokončit.", { cause: error });
}

function entityRef(db, ownerId, entityType, entityId) {
  return doc(db, "users", ownerId, entityType === "catch" ? "catches" : "trips", entityId);
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
  return {
    ...common,
    caughtAt: requireValue(record.caughtAt, record.createdAt),
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
    waterDepthM: requireValue(record.waterDepthM, null),
    bottomType: requireValue(record.bottomType, null),
    conditions: serializeConditions(record.conditions),
    conditionSources: serializeConditionSources(record.conditionSources),
    tripId: requireValue(record.tripId, null),
    method: requireValue(record.method, null),
    baits: requireValue(record.baits, []),
    result: requireValue(record.result, "unspecified"),
    photos: (record.photos ?? []).map((photo) => ({
      id: photo.id,
      name: photo.name ?? "fotografie",
      type: photo.type ?? photo.blob?.type ?? "image/jpeg",
      size: photo.blob?.size ?? photo.size ?? 0,
      ...(photo.storagePath ? { storagePath: photo.storagePath } : {}),
      ...(photo.sha256 ? { sha256: photo.sha256 } : {}),
    })),
    notes: requireValue(record.notes, ""),
    isFavorite: Boolean(record.isFavorite),
    privacy: normalizeCatchPrivacy(record.privacy),
  };
}

function fromRemoteDocument(entityType, data) {
  const record = { ...data };
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
  };
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
    : { ...common, entityType: "catch" };
}

function makePortError(error) {
  throw normalizeFirebaseError(error);
}

export function createFirestoreSyncAdapter({ now = () => new Date().toISOString(), db: suppliedDb, getCurrentUserId } = {}) {
  const db = suppliedDb ?? getConfiguredFirestore();
  const currentUserId = getCurrentUserId ?? (() => firebaseAuth.currentUserId());

  return {
    async read({ ownerId, entityType, entityId }) {
      requireActiveOwner(ownerId, currentUserId);
      try {
        const snapshot = await getDoc(entityRef(db, ownerId, entityType, entityId));
        if (!snapshot.exists()) return null;
        const remote = fromRemoteDocument(entityType, snapshot.data());
        return remote.deleted
          ? { ...remote, entityType, entityId }
          : remote;
      } catch (error) { makePortError(error); }
    },

    async write({ ownerId, entityType, entityId, record, expectedRevision, operationId, localRevision }) {
      requireActiveOwner(ownerId, currentUserId);
      const projected = toRemoteRecord(entityType, record, ownerId);
      const requestDigest = await digest({ entityType, entityId, ownerId, operationId, localRevision, operation: "upsert", record: projected });
      const ref = entityRef(db, ownerId, entityType, entityId);
      const receipt = doc(db, "users", ownerId, "syncOperations", receiptId(operationId, localRevision));
      const stateRef = doc(db, "users", ownerId, "sync", "state");
      const changeRef = doc(db, "users", ownerId, "syncChanges", receiptId(operationId, localRevision));
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

          const revision = (currentRevision ?? 0) + 1;
          const sequence = (stateSnapshot.exists() ? stateSnapshot.data().cursor : 0) + 1;
          const receiptDocument = {
            ownerId, receiptId: receipt.id, operationId, entityType, entityId,
            serverRevision: revision, sequence, localRevision, operationDigest: requestDigest,
            kind: "upsert", createdAt: now(),
          };
          const remoteDocument = {
            ...projected,
            entityType,
            serverRevision: revision,
            syncSequence: sequence,
            lastOperationId: operationId,
            clientLocalRevision: localRevision,
            operationDigest: requestDigest,
            lastReceiptId: receipt.id,
            deleted: false,
            deletedAt: null,
            photoState: entityType === "catch" && projected.photos.length > 0 ? "metadata-only" : "none",
          };
          transaction.set(ref, remoteDocument);
          transaction.set(receipt, receiptDocument);
          transaction.set(changeRef, receiptDocument);
          transaction.set(stateRef, { ownerId, cursor: sequence, lastReceiptId: receipt.id });
          return { revision, operationId, cursor: String(sequence) };
        });
        requireActiveOwner(ownerId, currentUserId);
        return result;
      } catch (error) { makePortError(error); }
    },

    async delete({ ownerId, entityType, entityId, expectedRevision, operationId, localRevision }) {
      requireActiveOwner(ownerId, currentUserId);
      const requestDigest = await digest({ ownerId, entityType, entityId, operationId, localRevision, operation: "delete" });
      const ref = entityRef(db, ownerId, entityType, entityId);
      const receipt = doc(db, "users", ownerId, "syncOperations", receiptId(operationId, localRevision));
      const stateRef = doc(db, "users", ownerId, "sync", "state");
      const changeRef = doc(db, "users", ownerId, "syncChanges", receiptId(operationId, localRevision));
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
          const revision = (currentRevision ?? 0) + 1;
          const sequence = (stateSnapshot.exists() ? stateSnapshot.data().cursor : 0) + 1;
          const tombstone = {
            ...(current ?? minimalTombstone(entityType, ownerId, entityId, now())),
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
          };
          const receiptDocument = {
            ownerId, receiptId: receipt.id, operationId, entityType, entityId,
            serverRevision: revision, sequence, localRevision, operationDigest: requestDigest,
            kind: "delete", createdAt: now(),
          };
          transaction.set(ref, tombstone);
          transaction.set(receipt, receiptDocument);
          transaction.set(changeRef, receiptDocument);
          transaction.set(stateRef, { ownerId, cursor: sequence, lastReceiptId: receipt.id });
          return { revision, operationId, cursor: String(sequence) };
        });
        requireActiveOwner(ownerId, currentUserId);
        return result;
      } catch (error) { makePortError(error); }
    },

    async list({ ownerId, entityType, cursor = null, limit: pageSize = 100 }) {
      requireActiveOwner(ownerId, currentUserId);
      try {
        const base = collection(db, "users", ownerId, entityType === "catch" ? "catches" : "trips");
        const constraints = [orderBy(documentId()), limit(pageSize + 1)];
        if (cursor) constraints.splice(1, 0, startAfter(cursor));
        const snapshot = await getDocs(query(base, ...constraints));
        const hasMore = snapshot.size > pageSize;
        const documents = snapshot.docs.slice(0, pageSize);
        return {
          items: documents.filter((item) => !item.data().deleted).map((item) => ({
            ...fromRemoteDocument(entityType, item.data()), entityType, entityId: item.id,
          })),
          cursor: documents.at(-1)?.id ?? cursor,
          hasMore,
        };
      } catch (error) { makePortError(error); }
    },

    async delta({ ownerId, cursor = null, limit: pageSize = 100 }) {
      requireActiveOwner(ownerId, currentUserId);
      const after = cursor === null ? 0 : Number(cursor);
      if (!Number.isSafeInteger(after) || after < 0) throw new SyncPortError("invalid_request", "Neplatný synchronizační kurzor.");
      try {
        const changes = collection(db, "users", ownerId, "syncChanges");
        const snapshot = await getDocs(query(changes, where("sequence", ">", after), orderBy("sequence"), limit(pageSize + 1)));
        const hasMore = snapshot.size > pageSize;
        const documents = snapshot.docs.slice(0, pageSize);
        const state = await getDoc(doc(db, "users", ownerId, "sync", "state"));
        return {
          items: documents.map((item) => ({ ...item.data(), cursor: String(item.data().sequence) })),
          cursor: documents.length
            ? String(documents.at(-1).data().sequence)
            : String(state.exists() ? state.data().cursor : after),
          hasMore,
        };
      } catch (error) { makePortError(error); }
    },
  };
}
