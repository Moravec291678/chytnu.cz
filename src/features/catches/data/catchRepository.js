import {
  accountScopeKey,
  createGuestScopeKey,
  isAccountScope,
  isGuestScope,
  recordScopeKey,
  validateDataScope,
} from "../../auth/data/localDataScope.js";
import { readPhotoBlob } from "./photoLocalBlob.js";

const DATABASE_NAME = "chytnu-local";
export const DATABASE_VERSION = 8;
export const CATCH_STORE_NAME = "catches";
export const TRIP_STORE_NAME = "trips";
export const WATER_STORE_NAME = "waters";
export const WATER_CHAT_STORE_NAME = "waterChat";
export const OUTBOX_STORE_NAME = "outbox";
export const CONFLICT_STORE_NAME = "syncConflicts";
export const SYNC_STATE_STORE_NAME = "syncState";
export const LOCAL_PROFILE_STORE_NAME = "localProfiles";
export const APP_META_STORE_NAME = "appMeta";
export const PRIVACY_STORE_NAME = "privacySettings";
export const PROGRESSION_EVENT_STORE_NAME = "progressionEvents";
export const ACTIVE_GUEST_SCOPE_KEY = "activeGuestScope";
export const PHOTO_BINARY_STORE_NAME = "photoBinaries";
export const NOTIFICATION_STORE_NAME = "notifications";

const sessionPhotoBlobs = new Map();
function sessionPhotoBlobKey(scopeKey, catchId, photoId) { return JSON.stringify([scopeKey, catchId, photoId]); }
function photoBinaryKey(scopeKey, catchId, photoId) { return JSON.stringify([scopeKey, catchId, photoId]); }
function equalBinary(left, right) {
  if (!(left instanceof ArrayBuffer || ArrayBuffer.isView(left))) return false;
  const a = new Uint8Array(left instanceof ArrayBuffer ? left : left.buffer, left instanceof ArrayBuffer ? 0 : left.byteOffset,
    left instanceof ArrayBuffer ? left.byteLength : left.byteLength);
  const b = new Uint8Array(right);
  return a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);
}

/** Keep readable bytes alive for this page session if Safari's IndexedDB copy cannot be read back. */
export function retainSessionPhotoBlob(scopeKey, catchId, photoId, blob) {
  if (blob instanceof Blob) sessionPhotoBlobs.set(sessionPhotoBlobKey(scopeKey, catchId, photoId), blob);
}

export function outboxEntityKey(scopeOrOwnerId, entityType, entityId) {
  const scopeKey = isGuestScope(scopeOrOwnerId) || isAccountScope(scopeOrOwnerId)
    ? scopeOrOwnerId
    : scopeOrOwnerId ? accountScopeKey(scopeOrOwnerId) : null;
  return JSON.stringify([scopeKey, entityType, entityId]);
}

function createOperationId() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Toto zařízení neumí vytvořit bezpečné ID synchronizační operace.");
  return crypto.randomUUID();
}

/** Add or coalesce a pending operation inside the caller's entity transaction. */
export function queueOutboxOperation(transaction, {
  entityType,
  entityId,
  operation,
  localRevision,
  ownerId = null,
  scopeKey = ownerId ? accountScopeKey(ownerId) : null,
  baseServerRevision = null,
  now = new Date().toISOString(),
}, onQueued = () => {}) {
  const store = transaction.objectStore(OUTBOX_STORE_NAME);
  if (!scopeKey) throw new Error("Synchronizační operace nemá datový scope.");
  validateDataScope({ scopeKey, ownerId });
  const key = outboxEntityKey(scopeKey, entityType, entityId);
  const request = store.index("entityKey").get(key);
  request.onerror = () => {
    try { transaction.abort(); } catch { /* transaction has already finished */ }
  };
  request.onsuccess = () => {
    try {
      const existing = request.result;
      const revisionFloor = existing
        ? existing.localRevision + (existing.operation !== operation ? 1 : 0)
        : 1;
      const revision = Math.max(localRevision, revisionFloor);
      const entry = {
        ...(existing ?? {}),
        operationId: existing?.operationId ?? createOperationId(),
        ownerId,
        scopeKey,
        entityType,
        entityId,
        entityKey: key,
        operation,
        localRevision: revision,
        baseServerRevision: existing?.baseServerRevision ?? baseServerRevision ?? null,
        status: "pending",
        attemptCount: 0,
        lastError: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const writeRequest = existing ? store.put(entry) : store.add(entry);
      writeRequest.onerror = () => {
        try { transaction.abort(); } catch { /* transaction has already finished */ }
      };
      writeRequest.onsuccess = () => onQueued(revision, entry);
    } catch {
      try { transaction.abort(); } catch { /* transaction has already finished */ }
    }
  };
}

function queuePhotoCloudOperation(transaction, {
  ownerId, catchId, photoId, operation, provider = null, objectKey, sha256 = null,
  size = null, contentType = null, dependsOnCatchOperationId = null,
  dependsOnCatchRevision = null, now = new Date().toISOString(),
}) {
  if (!ownerId || !catchId || !photoId || !["upload", "delete"].includes(operation)) {
    throw new TypeError("Photo cloud operace nemá platný účet, Catch, fotografii nebo typ.");
  }
  const scopeKey = accountScopeKey(ownerId);
  const entityId = `${catchId}/${photoId}`;
  const entityKey = outboxEntityKey(scopeKey, "photoCloud", entityId);
  const store = transaction.objectStore(OUTBOX_STORE_NAME);
  const request = store.index("entityKey").get(entityKey);
  request.onerror = () => { try { transaction.abort(); } catch { /* transaction has finished */ } };
  request.onsuccess = () => {
    try {
      const existing = request.result;
      const sameJob = existing?.operation === `photo-${operation}`
        && existing.photoCloud?.objectKey === objectKey
        && existing.photoCloud?.sha256 === sha256
        && existing.photoCloud?.dependsOnCatchOperationId === dependsOnCatchOperationId
        && existing.photoCloud?.dependsOnCatchRevision === dependsOnCatchRevision;
      if (sameJob) return;
      const entry = {
        ...(existing ?? {}),
        operationId: createOperationId(),
        ownerId,
        scopeKey,
        entityType: "photoCloud",
        entityId,
        entityKey,
        operation: `photo-${operation}`,
        localRevision: (existing?.localRevision ?? 0) + 1,
        baseServerRevision: null,
        photoCloud: {
          ownerId, catchId, photoId, provider, objectKey, sha256, size, contentType,
          dependsOnCatchOperationId, dependsOnCatchRevision,
          state: operation === "delete" ? "pendingDelete" : "pendingUpload",
        },
        status: "pending",
        attemptCount: 0,
        lastError: null,
        lastErrorCode: null,
        lastProviderCode: null,
        nextAttemptAt: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (existing) store.put(entry);
      else store.add(entry);
    } catch {
      try { transaction.abort(); } catch { /* transaction has finished */ }
    }
  };
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionResult(transaction, db, resolve, reject, onComplete = () => {}) {
  transaction.oncomplete = () => { db.close(); resolve(onComplete()); };
  transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Photo cloud frontu se nepodařilo uložit.")); };
  transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Zápis photo cloud fronty byl přerušen.")); };
}

export function openLocalDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Toto zařízení nepodporuje místní úložiště úlovků."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      const guestScopeKey = createGuestScopeKey();
      const catches = db.objectStoreNames.contains(CATCH_STORE_NAME)
        ? transaction.objectStore(CATCH_STORE_NAME)
        : db.createObjectStore(CATCH_STORE_NAME, { keyPath: "id" });
      const trips = db.objectStoreNames.contains(TRIP_STORE_NAME)
        ? transaction.objectStore(TRIP_STORE_NAME)
        : db.createObjectStore(TRIP_STORE_NAME, { keyPath: "id" });
      const waters = db.objectStoreNames.contains(WATER_STORE_NAME)
        ? transaction.objectStore(WATER_STORE_NAME)
        : db.createObjectStore(WATER_STORE_NAME, { keyPath: "id" });
      const waterChat = db.objectStoreNames.contains(WATER_CHAT_STORE_NAME)
        ? transaction.objectStore(WATER_CHAT_STORE_NAME)
        : db.createObjectStore(WATER_CHAT_STORE_NAME, { keyPath: "id" });
      const photoBinaries = db.objectStoreNames.contains(PHOTO_BINARY_STORE_NAME)
        ? transaction.objectStore(PHOTO_BINARY_STORE_NAME)
        : db.createObjectStore(PHOTO_BINARY_STORE_NAME, { keyPath: "key" });
      if (!photoBinaries.indexNames.contains("scopeKey")) photoBinaries.createIndex("scopeKey", "scopeKey", { unique: false });
      if (!photoBinaries.indexNames.contains("catchPhoto")) photoBinaries.createIndex("catchPhoto", ["scopeKey", "catchId"], { unique: false });
      if (!catches.indexNames.contains("scopeKey")) catches.createIndex("scopeKey", "scopeKey", { unique: false });
      if (!trips.indexNames.contains("scopeKey")) trips.createIndex("scopeKey", "scopeKey", { unique: false });
      if (!waters.indexNames.contains("scopeKey")) waters.createIndex("scopeKey", "scopeKey", { unique: false });
      if (!waters.indexNames.contains("name")) waters.createIndex("name", "name", { unique: false });
      if (!waterChat.indexNames.contains("waterId")) waterChat.createIndex("waterId", "waterId", { unique: false });
      if (!waterChat.indexNames.contains("scopeKey")) waterChat.createIndex("scopeKey", "scopeKey", { unique: false });
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        const outbox = db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: "sequence", autoIncrement: true });
        outbox.createIndex("entityKey", "entityKey", { unique: true });
        outbox.createIndex("operationId", "operationId", { unique: true });
        outbox.createIndex("status", "status", { unique: false });
        outbox.createIndex("scopeKey", "scopeKey", { unique: false });
      } else {
        const outbox = transaction.objectStore(OUTBOX_STORE_NAME);
        if (!outbox.indexNames.contains("scopeKey")) outbox.createIndex("scopeKey", "scopeKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(CONFLICT_STORE_NAME)) {
        const conflicts = db.createObjectStore(CONFLICT_STORE_NAME, { keyPath: "id" });
        conflicts.createIndex("ownerId", "ownerId", { unique: false });
        conflicts.createIndex("entityKey", "entityKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(SYNC_STATE_STORE_NAME)) {
        db.createObjectStore(SYNC_STATE_STORE_NAME, { keyPath: "ownerId" });
      }
      const profiles = db.objectStoreNames.contains(LOCAL_PROFILE_STORE_NAME)
        ? transaction.objectStore(LOCAL_PROFILE_STORE_NAME)
        : db.createObjectStore(LOCAL_PROFILE_STORE_NAME, { keyPath: "id" });
      if (!profiles.indexNames.contains("kind")) profiles.createIndex("kind", "kind", { unique: false });
      const appMeta = db.objectStoreNames.contains(APP_META_STORE_NAME)
        ? transaction.objectStore(APP_META_STORE_NAME)
        : db.createObjectStore(APP_META_STORE_NAME, { keyPath: "key" });
      const privacy = db.objectStoreNames.contains(PRIVACY_STORE_NAME)
        ? transaction.objectStore(PRIVACY_STORE_NAME)
        : db.createObjectStore(PRIVACY_STORE_NAME, { keyPath: "scopeKey" });
      if (!privacy.indexNames.contains("ownerId")) privacy.createIndex("ownerId", "ownerId", { unique: false });
      const progression = db.objectStoreNames.contains(PROGRESSION_EVENT_STORE_NAME)
        ? transaction.objectStore(PROGRESSION_EVENT_STORE_NAME)
        : db.createObjectStore(PROGRESSION_EVENT_STORE_NAME, { keyPath: "id" });
      for (const [name, keyPath] of [
        ["scopeKey", "scopeKey"],
        ["type", "type"],
        ["sourceKey", "sourceKey"],
        ["periodKey", "periodKey"],
        ["syncStatus", "sync.status"],
      ]) {
        if (!progression.indexNames.contains(name)) progression.createIndex(name, keyPath, { unique: false });
      }
      const notifications = db.objectStoreNames.contains(NOTIFICATION_STORE_NAME)
        ? transaction.objectStore(NOTIFICATION_STORE_NAME)
        : db.createObjectStore(NOTIFICATION_STORE_NAME, { keyPath: "id" });
      if (!notifications.indexNames.contains("scopeKey")) notifications.createIndex("scopeKey", "scopeKey", { unique: false });
      if (!notifications.indexNames.contains("createdAt")) notifications.createIndex("createdAt", "createdAt", { unique: false });

      if (event.oldVersion < 5) {
        const createdAt = new Date().toISOString();
        profiles.put({ id: guestScopeKey, kind: "guest", createdAt, updatedAt: createdAt });
        appMeta.put({ key: ACTIVE_GUEST_SCOPE_KEY, scopeKey: guestScopeKey });

        const migrateStore = (store) => {
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const record = cursor.value;
            const scopeKey = record.ownerId ? accountScopeKey(record.ownerId) : guestScopeKey;
            cursor.update({ ...record, scopeKey });
            cursor.continue();
          };
        };
        migrateStore(catches);
        migrateStore(trips);
        const outbox = transaction.objectStore(OUTBOX_STORE_NAME);
        const outboxCursor = outbox.openCursor();
        outboxCursor.onsuccess = () => {
          const cursor = outboxCursor.result;
          if (!cursor) return;
          const operation = cursor.value;
          const scopeKey = operation.ownerId ? accountScopeKey(operation.ownerId) : guestScopeKey;
          cursor.update({
            ...operation,
            scopeKey,
            entityKey: outboxEntityKey(scopeKey, operation.entityType, operation.entityId),
          });
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Databázi úlovků se nepodařilo otevřít."));
  });
}

export async function getActiveGuestScopeKey() {
  const db = await openLocalDatabase();
  try {
    const transaction = db.transaction(APP_META_STORE_NAME, "readonly");
    const value = await requestValue(transaction.objectStore(APP_META_STORE_NAME).get(ACTIVE_GUEST_SCOPE_KEY));
    if (!isGuestScope(value?.scopeKey)) throw new Error("Místní profil není dostupný.");
    return value.scopeKey;
  } finally {
    db.close();
  }
}

function requireRepositoryScope(options = {}) {
  return validateDataScope({ scopeKey: options.scopeKey, ownerId: options.ownerId ?? null });
}

async function listScopedRecords(storeName, scopeKey) {
  const db = await openLocalDatabase();
  let records;
  try {
    const transaction = db.transaction(storeName, "readonly");
    records = await requestValue(transaction.objectStore(storeName).index("scopeKey").getAll(scopeKey));
  } finally {
    db.close();
  }
  return storeName === CATCH_STORE_NAME ? hydratePhotoBinaryRecords(records, scopeKey) : records;
}

async function getScopedRecord(storeName, id, scopeKey) {
  let record = await runStoreOperation(storeName, "get", "readonly", id);
  if (!record) return undefined;
  if (recordScopeKey(record) !== scopeKey) throw new Error("Záznam nepatří do aktivního profilu.");
  if (storeName === CATCH_STORE_NAME) [record] = await hydratePhotoBinaryRecords([record], scopeKey);
  return record;
}

async function hydratePhotoBinaryRecords(records, scopeKey) {
  const db = await openLocalDatabase();
  let binaryGroups;
  try {
    const transaction = db.transaction(PHOTO_BINARY_STORE_NAME, "readonly");
    const index = transaction.objectStore(PHOTO_BINARY_STORE_NAME).index("catchPhoto");
    binaryGroups = await Promise.all(records.map((record) => requestValue(index.getAll([scopeKey, record.id]))));
  } finally { db.close(); }
  return records.map((record, recordIndex) => {
    const byKey = new Map(binaryGroups[recordIndex].map((item) => [item.key, item]));
    const photos = (record.photos ?? []).map((photo) => {
      const sessionBlob = sessionPhotoBlobs.get(sessionPhotoBlobKey(scopeKey, record.id, photo.id));
      if (sessionBlob) return { ...photo, blob: sessionBlob };
      if (photo.blob instanceof Blob) return photo;
      const saved = byKey.get(photoBinaryKey(scopeKey, record.id, photo.id));
      if (!saved || !(saved.bytes instanceof ArrayBuffer || ArrayBuffer.isView(saved.bytes))) return photo;
      return { ...photo, blob: new Blob([saved.bytes], { type: saved.type || photo.type || "application/octet-stream" }) };
    });
    return { ...record, photos };
  });
}

export async function runStoreOperation(storeName, operation, mode, record) {
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation === "list" ? store.getAll() : store[operation](record);
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error("Operace s úlovkem selhala."));
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Změnu se nepodařilo uložit.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Změna byla přerušena.")); };
  });
}

export const catchRepository = {
  list: (options) => {
    const { scopeKey } = requireRepositoryScope(options);
    return listScopedRecords(CATCH_STORE_NAME, scopeKey);
  },
  get: (id, options) => {
    const { scopeKey } = requireRepositoryScope(options);
    return getScopedRecord(CATCH_STORE_NAME, id, scopeKey);
  },
  put: async (record, options) => {
    const requestedScope = requireRepositoryScope(options);
    const preparedPhotoBytes = new Map();
    for (const photo of record.photos ?? []) {
      if (!(photo.blob instanceof Blob)) continue;
      try { preparedPhotoBytes.set(photo.id, await readPhotoBlob(photo.blob, "photo-store-write-source")); }
      catch { /* Preserve the original object in the Catch record if its bytes cannot be copied. */ }
    }
    const db = await openLocalDatabase();
    let existingPhotoBinaries = [];
    if (preparedPhotoBytes.size) {
      const readTransaction = db.transaction(PHOTO_BINARY_STORE_NAME, "readonly");
      existingPhotoBinaries = await requestValue(readTransaction.objectStore(PHOTO_BINARY_STORE_NAME).index("catchPhoto").getAll([requestedScope.scopeKey, record.id]));
    }
    const existingPhotoBinaryByKey = new Map(existingPhotoBinaries.map((item) => [item.key, item]));
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CATCH_STORE_NAME, TRIP_STORE_NAME, WATER_STORE_NAME, OUTBOX_STORE_NAME, PHOTO_BINARY_STORE_NAME], "readwrite");
      const catchStore = transaction.objectStore(CATCH_STORE_NAME);
      const photoBinaryStore = transaction.objectStore(PHOTO_BINARY_STORE_NAME);
      let failure;
      let storedRecord = record;
      const existingRequest = catchStore.get(record.id);
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result;
        if (existing && recordScopeKey(existing) !== requestedScope.scopeKey) {
          failure = new Error("Úlovek nepatří do aktivního profilu.");
          transaction.abort();
          return;
        }
        const effectiveOwnerId = existing ? (existing.ownerId ?? null) : requestedScope.ownerId;
        const effectiveScopeKey = existing ? recordScopeKey(existing) : requestedScope.scopeKey;
        const nextPhotoIds = new Set((record.photos ?? []).map((photo) => photo.id));
        const queueWrite = () => {
          storedRecord = { ...record, ownerId: effectiveOwnerId, scopeKey: effectiveScopeKey };
          const persistedPhotos = (record.photos ?? []).map((photo) => {
            const bytes = preparedPhotoBytes.get(photo.id);
            if (!bytes) return photo;
            const key = photoBinaryKey(effectiveScopeKey, record.id, photo.id);
            const type = photo.blob.type || photo.type || "application/octet-stream";
            const existingBinary = existingPhotoBinaryByKey.get(key);
            if (!existingBinary || existingBinary.type !== type || !equalBinary(existingBinary.bytes, bytes)) {
              photoBinaryStore.put({ key, scopeKey: effectiveScopeKey, catchId: record.id, photoId: photo.id,
                type, size: bytes.byteLength, bytes });
            }
            const metadata = { ...photo };
            delete metadata.blob;
            return metadata;
          });
          const persistedRecord = { ...storedRecord, photos: persistedPhotos };
          queueOutboxOperation(transaction, {
            entityType: "catch",
            entityId: record.id,
            operation: "upsert",
            localRevision: record.sync?.revision ?? 1,
            ownerId: effectiveOwnerId,
            scopeKey: effectiveScopeKey,
            baseServerRevision: existing?.sync?.serverRevision ?? record.sync?.serverRevision ?? null,
          }, (revision, entry) => {
            storedRecord = {
              ...storedRecord,
              sync: {
                ...(record.sync ?? {}),
                status: "local",
                revision,
                photoStatus: (storedRecord.photos ?? []).length === 0
                  ? "none"
                  : (storedRecord.photos ?? []).some((photo) => photo.blob || preparedPhotoBytes.has(photo.id)) ? "local-only" : "metadata-only",
                ...(existing?.sync?.serverRevision !== undefined ? { serverRevision: existing.sync.serverRevision } : {}),
              },
            };
            for (const photo of existing?.photos ?? []) {
              if (nextPhotoIds.has(photo.id) || !photo.cloud?.provider || !photo.cloud?.objectKey || !effectiveOwnerId) continue;
              queuePhotoCloudOperation(transaction, {
                ownerId: effectiveOwnerId,
                catchId: existing.id,
                photoId: photo.id,
                operation: "delete",
                provider: photo.cloud.provider,
                objectKey: photo.cloud.objectKey,
                sha256: photo.cloud.sha256 ?? null,
                size: photo.blob?.size ?? photo.size ?? null,
                contentType: photo.type ?? photo.blob?.type ?? null,
                dependsOnCatchOperationId: entry.operationId,
                dependsOnCatchRevision: revision,
              });
            }
            catchStore.put({ ...persistedRecord, sync: storedRecord.sync });
          });
        };

        if (!record.tripId) {
          queueWrite();
          return;
        }

        const tripRequest = transaction.objectStore(TRIP_STORE_NAME).get(record.tripId);
        tripRequest.onsuccess = () => {
          const trip = tripRequest.result;
          if (!trip) {
            failure = new Error("Vybraná vycházka již neexistuje. Obnov seznam vycházek a zkus to znovu.");
            transaction.abort();
            return;
          }
          // A newly account-owned catch cannot silently bind an older local
          // trip. It remains local until the explicit migration stage.
          if (recordScopeKey(trip) !== effectiveScopeKey) {
            failure = new Error("Tento úlovek odkazuje na vycházku jiného profilu.");
            transaction.abort();
            return;
          }
          queueWrite();
        };
        tripRequest.onerror = () => { failure = tripRequest.error; transaction.abort(); };
      };
      existingRequest.onerror = () => { failure = existingRequest.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(storedRecord); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Změnu se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Změna byla přerušena.")); };
    });
  },
  delete: async (id, options) => {
    const requestedScope = requireRepositoryScope(options);
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CATCH_STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
      const store = transaction.objectStore(CATCH_STORE_NAME);
      const request = store.get(id);
      let failure;
      request.onsuccess = () => {
        const existing = request.result;
        if (!existing) return;
        if (recordScopeKey(existing) !== requestedScope.scopeKey) {
          failure = new Error("Úlovek nepatří do aktivního profilu.");
          transaction.abort();
          return;
        }
        queueOutboxOperation(transaction, {
          entityType: "catch",
          entityId: id,
          operation: "delete",
          localRevision: (existing.sync?.revision ?? 0) + 1,
          ownerId: existing.ownerId ?? null,
          scopeKey: recordScopeKey(existing),
          baseServerRevision: existing.sync?.serverRevision ?? null,
        }, (revision, entry) => {
          for (const photo of existing.photos ?? []) {
            if (!existing.ownerId || !photo.cloud?.provider || !photo.cloud?.objectKey) continue;
            queuePhotoCloudOperation(transaction, {
              ownerId: existing.ownerId,
              catchId: existing.id,
              photoId: photo.id,
              operation: "delete",
              provider: photo.cloud.provider,
              objectKey: photo.cloud.objectKey,
              sha256: photo.cloud.sha256 ?? null,
              size: photo.blob?.size ?? photo.size ?? null,
              contentType: photo.type ?? photo.blob?.type ?? null,
              dependsOnCatchOperationId: entry.operationId,
              dependsOnCatchRevision: revision,
            });
          }
          store.delete(id);
        });
      };
      request.onerror = () => { failure = request.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(id); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Úlovek se nepodařilo smazat.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Mazání úlovku bylo přerušeno.")); };
    });
  },
  cachePhotoBlob: async (catchId, photoId, blob, options) => {
    const requestedScope = requireRepositoryScope(options);
    if (!(blob instanceof Blob)) throw new TypeError("Do místní cache lze uložit pouze Blob fotografie.");
    const bytes = await readPhotoBlob(blob, "photo-cache-write-source");
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CATCH_STORE_NAME, PHOTO_BINARY_STORE_NAME], "readwrite");
      const store = transaction.objectStore(CATCH_STORE_NAME);
      const photoBinaryStore = transaction.objectStore(PHOTO_BINARY_STORE_NAME);
      const request = store.get(catchId);
      let result = null;
      request.onsuccess = () => {
        const record = request.result;
        if (!record || recordScopeKey(record) !== requestedScope.scopeKey) {
          transaction.abort();
          return;
        }
        const photo = (record.photos ?? []).find((item) => item.id === photoId);
        if (!photo) { result = null; return; }
        // This path is only used after a verified Cloudinary fetch; replacing a
        // broken local Blob is safe because the remote bytes were hash-checked.
        photoBinaryStore.put({ key: photoBinaryKey(requestedScope.scopeKey, catchId, photoId), scopeKey: requestedScope.scopeKey,
          catchId, photoId, type: blob.type || photo.type || "application/octet-stream", size: bytes.byteLength, bytes });
        store.put({ ...record, photos: record.photos.map((item) => {
          if (item.id !== photoId) return item;
          const metadata = { ...item };
          delete metadata.blob;
          return metadata;
        }) });
        result = blob;
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Fotografii se nepodařilo uložit do místní cache.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Cache fotografie byla přerušena.")); };
    });
  },
  setPhotoCloudState: async (catchId, photoId, cloud, options) => {
    const requestedScope = requireRepositoryScope(options);
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CATCH_STORE_NAME, "readwrite");
      const store = transaction.objectStore(CATCH_STORE_NAME);
      const request = store.get(catchId);
      let updated = false;
      request.onsuccess = () => {
        const record = request.result;
        if (!record || recordScopeKey(record) !== requestedScope.scopeKey) { transaction.abort(); return; }
        const photos = record.photos ?? [];
        if (!photos.some((photo) => photo.id === photoId)) return;
        store.put({ ...record, photos: photos.map((photo) => photo.id === photoId ? { ...photo, cloud } : photo) });
        updated = true;
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(updated); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Stav cloud fotografie se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Zápis stavu fotografie byl přerušen.")); };
    });
  },
  setPhotoLocalError: async (catchId, photoId, localError, options) => {
    const requestedScope = requireRepositoryScope(options);
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CATCH_STORE_NAME, "readwrite");
      const store = transaction.objectStore(CATCH_STORE_NAME);
      const request = store.get(catchId);
      let updated = false;
      request.onsuccess = () => {
        const record = request.result;
        if (!record || recordScopeKey(record) !== requestedScope.scopeKey) { transaction.abort(); return; }
        const photos = record.photos ?? [];
        if (!photos.some((photo) => photo.id === photoId)) return;
        const safeError = localError ? {
          code: typeof localError.code === "string" && /^[a-z0-9_:-]{1,64}$/i.test(localError.code) ? localError.code : "unknown",
          errorName: ["NotFoundError", "DataError", "TypeError", "InvalidStateError", "AbortError", "SecurityError"].includes(localError.errorName) ? localError.errorName : "Error",
          stage: typeof localError.stage === "string" && /^[a-z0-9-]{1,64}$/.test(localError.stage) ? localError.stage : "photo-read-local-blob",
        } : null;
        const existingPhoto = photos.find((photo) => photo.id === photoId);
        if (!safeError && !existingPhoto?.localError) return;
        if (safeError && existingPhoto?.localError?.code === safeError.code
          && existingPhoto.localError.errorName === safeError.errorName && existingPhoto.localError.stage === safeError.stage) return;
        store.put({ ...record, photos: photos.map((photo) => photo.id === photoId
          ? { ...photo, ...(safeError ? { localError: safeError } : { localError: undefined }) } : photo) });
        updated = true;
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(updated); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Lokální stav fotografie se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Zápis lokálního stavu fotografie byl přerušen.")); };
    });
  },
};

export const photoCloudOutboxRepository = {
  enqueue: async (operation) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(OUTBOX_STORE_NAME, "readwrite");
      let accepted = false;
      try {
        queuePhotoCloudOperation(transaction, operation);
        accepted = true;
      } catch (error) {
        db.close();
        reject(error);
        return;
      }
      transactionResult(transaction, db, resolve, reject, () => accepted);
    });
  },
  list: async () => (await outboxRepository.list()).filter((operation) => operation.entityType === "photoCloud"),
  setStage: async (operationId, expectedLocalRevision, stage) => {
    if (!["preparing", "signing", "uploading", "verifying", "persisting"].includes(stage)) {
      throw new TypeError("Photo upload stage is not supported.");
    }
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(OUTBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE_NAME);
      const request = store.index("operationId").get(operationId);
      let updated = false;
      request.onsuccess = () => {
        const operation = request.result;
        if (!operation || operation.entityType !== "photoCloud" || operation.localRevision !== expectedLocalRevision) return;
        store.put({ ...operation, status: stage,
          ...(stage === "preparing" ? { lastError: null, lastErrorCode: null, lastProviderCode: null, lastEndpoint: null, nextAttemptAt: null } : {}),
          photoCloud: { ...operation.photoCloud, state: stage }, updatedAt: new Date().toISOString() });
        updated = true;
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(updated); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Stav photo uploadu se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Stav photo uploadu byl přerušen.")); };
    });
  },
  complete: async (operationId, expectedLocalRevision) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(OUTBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE_NAME);
      const request = store.index("operationId").get(operationId);
      let completed = false;
      request.onsuccess = () => {
        const operation = request.result;
        if (!operation || operation.entityType !== "photoCloud" || operation.localRevision !== expectedLocalRevision) return;
        store.delete(operation.sequence);
        completed = true;
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(completed); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Photo cloud operaci se nepodařilo potvrdit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Potvrzení photo cloud operace bylo přerušeno.")); };
    });
  },
  isCurrent: async (operationId, expectedLocalRevision) => {
    const db = await openLocalDatabase();
    try {
      const transaction = db.transaction(OUTBOX_STORE_NAME, "readonly");
      const operation = await requestValue(transaction.objectStore(OUTBOX_STORE_NAME).index("operationId").get(operationId));
      return operation?.entityType === "photoCloud" && operation.localRevision === expectedLocalRevision;
    } finally { db.close(); }
  },
};

export const outboxRepository = {
  list: async () => {
    const operations = await runStoreOperation(OUTBOX_STORE_NAME, "list", "readonly");
    return operations.sort((left, right) => left.sequence - right.sequence);
  },
  markFailed: async (operationId, message, details = {}) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(OUTBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE_NAME);
      const request = store.index("operationId").get(operationId);
      let result = false;
      request.onsuccess = () => {
        if (!request.result) return;
        const operation = request.result;
        operation.status = "failed";
        if (operation.entityType === "photoCloud" && operation.photoCloud) operation.photoCloud.state = "failed_retryable";
        operation.attemptCount += 1;
        operation.lastError = String(message || "Operaci se nepodařilo synchronizovat.");
        operation.lastErrorCode = typeof details.code === "string" ? details.code : "unknown";
        operation.lastProviderCode = typeof details.providerCode === "string" ? details.providerCode : null;
        operation.lastEndpoint = ["/api/cloudinary/sign", "/api/cloudinary/verify-upload", "/api/cloudinary/delivery", "/api/cloudinary/delete", "/api/cloudinary/metadata"].includes(details.endpoint)
          ? details.endpoint : null;
        operation.nextAttemptAt = new Date(Date.now() + Math.min(30 * 60_000, 1000 * 2 ** Math.min(operation.attemptCount, 10))).toISOString();
        operation.updatedAt = new Date().toISOString();
        store.put(operation);
        result = true;
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Stav operace se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Změna stavu operace byla přerušena.")); };
    });
  },
  markConflict: async (operationId, message, errorCode = "conflict") => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(OUTBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE_NAME);
      const request = store.index("operationId").get(operationId);
      let result = false;
      request.onsuccess = () => {
        if (!request.result) return;
        const operation = request.result;
        store.put({ ...operation, status: "conflict", lastError: String(message), lastErrorCode: errorCode,
          ...(operation.entityType === "photoCloud" && operation.photoCloud
            ? { photoCloud: { ...operation.photoCloud, state: "failed_terminal" } } : {}), updatedAt: new Date().toISOString() });
        result = true;
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Konflikt se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Uložení konfliktu bylo přerušeno.")); };
    });
  },
  acknowledge: async (operationId, expectedLocalRevision, serverRevision = null) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CATCH_STORE_NAME, TRIP_STORE_NAME, WATER_STORE_NAME, OUTBOX_STORE_NAME, PHOTO_BINARY_STORE_NAME], "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE_NAME);
      const request = store.index("operationId").get(operationId);
      let acknowledged = false;
      request.onsuccess = () => {
        const operation = request.result;
        if (!operation || operation.localRevision !== expectedLocalRevision) return;
        if (operation.operation === "delete") {
          store.delete(operation.sequence);
          acknowledged = true;
          return;
        }
        if (operation.operation === "upsert") {
          const entityStore = transaction.objectStore(operation.entityType === "catch" ? CATCH_STORE_NAME : operation.entityType === "trip" ? TRIP_STORE_NAME : WATER_STORE_NAME);
          const entityRequest = entityStore.get(operation.entityId);
          entityRequest.onsuccess = () => {
            const record = entityRequest.result;
            if (!record || recordScopeKey(record) !== operation.scopeKey || record.sync?.revision !== expectedLocalRevision) return;
            const saveAcknowledgedRecord = (photosLocal) => {
              entityStore.put({
                ...record,
                sync: {
                  ...record.sync,
                  status: "metadata-synced",
                  serverRevision,
                  photoStatus: photosLocal ? "local-only" : (record.photos?.length ? "metadata-only" : "none"),
                },
              });
              store.delete(operation.sequence);
              acknowledged = true;
            };
            if (operation.entityType === "catch" && !(record.photos ?? []).some((photo) => photo.blob) && record.photos?.length) {
              const photoRequest = transaction.objectStore(PHOTO_BINARY_STORE_NAME).index("catchPhoto").getAll([operation.scopeKey, record.id]);
              photoRequest.onsuccess = () => {
                const photoIds = new Set(photoRequest.result.filter((photo) => photo.catchId === record.id).map((photo) => photo.photoId));
                saveAcknowledgedRecord((record.photos ?? []).some((photo) => photoIds.has(photo.id)));
              };
              photoRequest.onerror = () => transaction.abort();
            } else {
              saveAcknowledgedRecord(operation.entityType === "catch" && (record.photos ?? []).some((photo) => photo.blob));
            }
          };
          entityRequest.onerror = () => transaction.abort();
        }
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(acknowledged); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Potvrzení operace se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Potvrzení operace bylo přerušeno.")); };
    });
  },
};
