import {
  accountScopeKey,
  createGuestScopeKey,
  isAccountScope,
  isGuestScope,
  recordScopeKey,
  validateDataScope,
} from "../../auth/data/localDataScope.js";

const DATABASE_NAME = "chytnu-local";
export const DATABASE_VERSION = 5;
export const CATCH_STORE_NAME = "catches";
export const TRIP_STORE_NAME = "trips";
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

export function openLocalDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Toto zařízení nepodporuje místní úložiště úlovků."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction;
      const guestScopeKey = createGuestScopeKey();
      const catches = db.objectStoreNames.contains(CATCH_STORE_NAME)
        ? transaction.objectStore(CATCH_STORE_NAME)
        : db.createObjectStore(CATCH_STORE_NAME, { keyPath: "id" });
      const trips = db.objectStoreNames.contains(TRIP_STORE_NAME)
        ? transaction.objectStore(TRIP_STORE_NAME)
        : db.createObjectStore(TRIP_STORE_NAME, { keyPath: "id" });
      if (!catches.indexNames.contains("scopeKey")) catches.createIndex("scopeKey", "scopeKey", { unique: false });
      if (!trips.indexNames.contains("scopeKey")) trips.createIndex("scopeKey", "scopeKey", { unique: false });
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Databázi úlovků se nepodařilo otevřít."));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
      const transaction = db.transaction([CATCH_STORE_NAME, TRIP_STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
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
          }, (revision) => {
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
        }, () => store.delete(id));
      };
      request.onerror = () => { failure = request.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(id); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Úlovek se nepodařilo smazat.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Mazání úlovku bylo přerušeno.")); };
    });
  },
  markPhotosSynced: async (id, expectedRevision, remotePhotos, options) => {
    const requestedScope = requireRepositoryScope(options);
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CATCH_STORE_NAME, "readwrite");
      const store = transaction.objectStore(CATCH_STORE_NAME);
      const request = store.get(id);
      let updated = false;
      request.onsuccess = () => {
        const record = request.result;
        if (!record || recordScopeKey(record) !== requestedScope.scopeKey || record.sync?.revision !== expectedRevision) return;
        const byId = new Map(remotePhotos.map((photo) => [photo.id, photo]));
        const photos = (record.photos ?? []).map((photo) => {
          const remote = byId.get(photo.id);
          return remote?.storagePath && remote?.sha256
            ? { ...photo, storagePath: remote.storagePath, sha256: remote.sha256, size: remote.size, photoStatus: "synced" }
            : photo;
        });
        store.put({ ...record, photos, sync: { ...record.sync, photoStatus: photos.length ? "synced" : "none" } });
        updated = true;
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(updated); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Stav fotografií se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Uložení stavu fotografií bylo přerušeno.")); };
    });
  },
};

export const outboxRepository = {
  list: async () => {
    const operations = await runStoreOperation(OUTBOX_STORE_NAME, "list", "readonly");
    return operations.sort((left, right) => left.sequence - right.sequence);
  },
  markFailed: async (operationId, message) => {
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
      const transaction = db.transaction([CATCH_STORE_NAME, TRIP_STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
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
          const entityStore = transaction.objectStore(operation.entityType === "catch" ? CATCH_STORE_NAME : TRIP_STORE_NAME);
          const entityRequest = entityStore.get(operation.entityId);
          entityRequest.onsuccess = () => {
            const record = entityRequest.result;
            if (!record || recordScopeKey(record) !== operation.scopeKey || record.sync?.revision !== expectedLocalRevision) return;
            const photosPending = operation.entityType === "catch"
              && (record.photos ?? []).some((photo) => photo.blob && (!photo.storagePath || !photo.sha256));
            entityStore.put({
              ...record,
              sync: {
                ...record.sync,
                status: "metadata-synced",
                serverRevision,
                photoStatus: photosPending ? "local-only" : (record.photos?.length ? "synced" : "none"),
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
