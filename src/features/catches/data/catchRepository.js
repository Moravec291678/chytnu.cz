import {
  accountScopeKey,
  createGuestScopeKey,
  isAccountScope,
  isGuestScope,
  recordScopeKey,
  validateDataScope,
} from "../../auth/data/localDataScope.js";

const DATABASE_NAME = "chytnu-local";
export const DATABASE_VERSION = 6;
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
  try {
    const transaction = db.transaction(storeName, "readonly");
    return await requestValue(transaction.objectStore(storeName).index("scopeKey").getAll(scopeKey));
  } finally {
    db.close();
  }
}

async function getScopedRecord(storeName, id, scopeKey) {
  const record = await runStoreOperation(storeName, "get", "readonly", id);
  if (!record) return undefined;
  if (recordScopeKey(record) !== scopeKey) throw new Error("Záznam nepatří do aktivního profilu.");
  return record;
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
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CATCH_STORE_NAME, TRIP_STORE_NAME, WATER_STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
      const catchStore = transaction.objectStore(CATCH_STORE_NAME);
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
                  : (storedRecord.photos ?? []).some((photo) => photo.blob) ? "local-only" : "metadata-only",
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
            catchStore.put(storedRecord);
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
            failure = new Error("Vybraná výprava již neexistuje. Obnov seznam výprav a zkus to znovu.");
            transaction.abort();
            return;
          }
          // A newly account-owned catch cannot silently bind an older local
          // trip. It remains local until the explicit migration stage.
          if (recordScopeKey(trip) !== effectiveScopeKey) {
            failure = new Error("Tento úlovek odkazuje na výpravu jiného profilu.");
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
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CATCH_STORE_NAME, "readwrite");
      const store = transaction.objectStore(CATCH_STORE_NAME);
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
        if (photo.blob instanceof Blob) { result = photo.blob; return; }
        store.put({ ...record, photos: record.photos.map((item) => item.id === photoId ? { ...item, blob } : item) });
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
        operation.attemptCount += 1;
        operation.lastError = String(message || "Operaci se nepodařilo synchronizovat.");
        operation.lastErrorCode = typeof details.code === "string" ? details.code : "unknown";
        operation.lastProviderCode = typeof details.providerCode === "string" ? details.providerCode : null;
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
  markConflict: async (operationId, message) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(OUTBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE_NAME);
      const request = store.index("operationId").get(operationId);
      let result = false;
      request.onsuccess = () => {
        if (!request.result) return;
        store.put({ ...request.result, status: "conflict", lastError: String(message), updatedAt: new Date().toISOString() });
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
      const transaction = db.transaction([CATCH_STORE_NAME, TRIP_STORE_NAME, WATER_STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
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
            const photosLocal = operation.entityType === "catch" && (record.photos ?? []).some((photo) => photo.blob);
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
