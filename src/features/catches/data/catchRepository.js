const DATABASE_NAME = "chytnu-local";
const DATABASE_VERSION = 4;
const CATCH_STORE_NAME = "catches";
const TRIP_STORE_NAME = "trips";
export const OUTBOX_STORE_NAME = "outbox";
export const CONFLICT_STORE_NAME = "syncConflicts";
export const SYNC_STATE_STORE_NAME = "syncState";

export function outboxEntityKey(ownerId, entityType, entityId) {
  return JSON.stringify([ownerId ?? null, entityType, entityId]);
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
  baseServerRevision = null,
  now = new Date().toISOString(),
}, onQueued = () => {}) {
  const store = transaction.objectStore(OUTBOX_STORE_NAME);
  const key = outboxEntityKey(ownerId, entityType, entityId);
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
      if (!db.objectStoreNames.contains(CATCH_STORE_NAME)) db.createObjectStore(CATCH_STORE_NAME, { keyPath: "id" });
      if (!db.objectStoreNames.contains(TRIP_STORE_NAME)) db.createObjectStore(TRIP_STORE_NAME, { keyPath: "id" });
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        const outbox = db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: "sequence", autoIncrement: true });
        outbox.createIndex("entityKey", "entityKey", { unique: true });
        outbox.createIndex("operationId", "operationId", { unique: true });
        outbox.createIndex("status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains(CONFLICT_STORE_NAME)) {
        const conflicts = db.createObjectStore(CONFLICT_STORE_NAME, { keyPath: "id" });
        conflicts.createIndex("ownerId", "ownerId", { unique: false });
        conflicts.createIndex("entityKey", "entityKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(SYNC_STATE_STORE_NAME)) {
        db.createObjectStore(SYNC_STATE_STORE_NAME, { keyPath: "ownerId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Databázi úlovků se nepodařilo otevřít."));
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
  list: () => runStoreOperation(CATCH_STORE_NAME, "list", "readonly"),
  get: (id) => runStoreOperation(CATCH_STORE_NAME, "get", "readonly", id),
  put: async (record, { ownerId = null } = {}) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CATCH_STORE_NAME, TRIP_STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
      const catchStore = transaction.objectStore(CATCH_STORE_NAME);
      let failure;
      let storedRecord = record;
      const existingRequest = catchStore.get(record.id);
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result;
        // A record's owner is immutable here: only a newly created row may
        // receive the UID supplied by the authenticated application context.
        const effectiveOwnerId = existing ? (existing.ownerId ?? null) : (ownerId || null);
        const queueWrite = () => {
          storedRecord = { ...record, ownerId: effectiveOwnerId };
          queueOutboxOperation(transaction, {
            entityType: "catch",
            entityId: record.id,
            operation: "upsert",
            localRevision: record.sync?.revision ?? 1,
            ownerId: effectiveOwnerId,
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
          if ((trip.ownerId ?? null) !== effectiveOwnerId) {
            failure = new Error("Tento úlovek odkazuje na místní výpravu, která není propojena s tímto účtem.");
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
  delete: async (id) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CATCH_STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
      const store = transaction.objectStore(CATCH_STORE_NAME);
      const request = store.get(id);
      let failure;
      request.onsuccess = () => {
        const existing = request.result;
        if (!existing) return;
        queueOutboxOperation(transaction, {
          entityType: "catch",
          entityId: id,
          operation: "delete",
          localRevision: (existing.sync?.revision ?? 0) + 1,
          ownerId: existing.ownerId ?? null,
          baseServerRevision: existing.sync?.serverRevision ?? null,
        }, () => store.delete(id));
      };
      request.onerror = () => { failure = request.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(id); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Úlovek se nepodařilo smazat.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Mazání úlovku bylo přerušeno.")); };
    });
  },
  markPhotosSynced: async (id, expectedRevision, remotePhotos) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CATCH_STORE_NAME, "readwrite");
      const store = transaction.objectStore(CATCH_STORE_NAME);
      const request = store.get(id);
      let updated = false;
      request.onsuccess = () => {
        const record = request.result;
        if (!record || record.sync?.revision !== expectedRevision) return;
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
            if (!record || record.sync?.revision !== expectedLocalRevision) return;
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
