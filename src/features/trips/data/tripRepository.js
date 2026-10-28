import {
  openLocalDatabase,
  OUTBOX_STORE_NAME,
  queueOutboxOperation,
  runStoreOperation,
} from "../../catches/data/catchRepository.js";
import { recordScopeKey, validateDataScope } from "../../auth/data/localDataScope.js";

const STORE_NAME = "trips";

function requireScope(options = {}) {
  return validateDataScope({ scopeKey: options.scopeKey, ownerId: options.ownerId ?? null });
}

async function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const tripRepository = {
  list: async (options) => {
    const { scopeKey } = requireScope(options);
    const db = await openLocalDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      return await requestValue(transaction.objectStore(STORE_NAME).index("scopeKey").getAll(scopeKey));
    } finally { db.close(); }
  },
  get: async (id, options) => {
    const { scopeKey } = requireScope(options);
    const trip = await runStoreOperation(STORE_NAME, "get", "readonly", id);
    if (!trip) return undefined;
    if (recordScopeKey(trip) !== scopeKey) throw new Error("Vycházka nepatří do aktivního profilu.");
    return trip;
  },
  put: async (trip, options) => {
    const requestedScope = requireScope(options);
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      let storedTrip = trip;
      const request = store.get(trip.id);
      request.onsuccess = () => {
        const existing = request.result;
        if (existing && recordScopeKey(existing) !== requestedScope.scopeKey) {
          transaction.abort();
          return;
        }
        const effectiveOwnerId = existing ? (existing.ownerId ?? null) : requestedScope.ownerId;
        const effectiveScopeKey = existing ? recordScopeKey(existing) : requestedScope.scopeKey;
        queueOutboxOperation(transaction, {
          entityType: "trip",
          entityId: trip.id,
          operation: "upsert",
          localRevision: trip.sync?.revision ?? 1,
          ownerId: effectiveOwnerId,
          scopeKey: effectiveScopeKey,
          baseServerRevision: existing?.sync?.serverRevision ?? trip.sync?.serverRevision ?? null,
        }, (revision) => {
          storedTrip = {
            ...trip,
            ownerId: effectiveOwnerId,
            scopeKey: effectiveScopeKey,
            sync: {
              ...(trip.sync ?? {}),
              status: "local",
              revision,
              ...(existing?.sync?.serverRevision !== undefined ? { serverRevision: existing.sync.serverRevision } : {}),
            },
          };
          store.put(storedTrip);
        });
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => { db.close(); resolve(storedTrip); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Vycházku se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Uložení vycházky bylo přerušeno.")); };
    });
  },
  delete: async (id, options) => {
    const requestedScope = requireScope(options);
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME, "catches", OUTBOX_STORE_NAME], "readwrite");
      const tripStore = transaction.objectStore(STORE_NAME);
      const request = transaction.objectStore("catches").getAll();
      let failure;
      request.onsuccess = () => {
        if (request.result.some((item) => item.tripId === id && recordScopeKey(item) === requestedScope.scopeKey)) {
          failure = new Error("Vycházka obsahuje úlovky a nelze ji smazat.");
          transaction.abort();
          return;
        }
        const tripRequest = tripStore.get(id);
        tripRequest.onsuccess = () => {
          if (!tripRequest.result) return;
          if (recordScopeKey(tripRequest.result) !== requestedScope.scopeKey) {
            failure = new Error("Vycházka nepatří do aktivního profilu.");
            transaction.abort();
            return;
          }
          queueOutboxOperation(transaction, {
            entityType: "trip",
            entityId: id,
            operation: "delete",
            localRevision: (tripRequest.result.sync?.revision ?? 0) + 1,
            ownerId: tripRequest.result.ownerId ?? null,
            scopeKey: recordScopeKey(tripRequest.result),
            baseServerRevision: tripRequest.result.sync?.serverRevision ?? null,
          }, () => tripStore.delete(id));
        };
        tripRequest.onerror = () => { failure = tripRequest.error; transaction.abort(); };
      };
      request.onerror = () => { failure = request.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(id); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Vycházku se nepodařilo smazat.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Mazání vycházky bylo přerušeno.")); };
    });
  },
  start: async (trip, options) => {
    const requestedScope = requireScope(options);
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      let failure;
      let storedTrip = trip;
      request.onsuccess = () => {
        if (request.result.some((item) => !item.endedAt && recordScopeKey(item) === requestedScope.scopeKey)) {
          failure = new Error("Nejprve ukonči aktivní vycházku.");
          transaction.abort();
          return;
        }
        queueOutboxOperation(transaction, {
          entityType: "trip",
          entityId: trip.id,
          operation: "upsert",
          localRevision: trip.sync?.revision ?? 1,
          ownerId: requestedScope.ownerId,
          scopeKey: requestedScope.scopeKey,
          baseServerRevision: trip.sync?.serverRevision ?? null,
        }, (revision) => {
          storedTrip = {
            ...trip,
            ownerId: requestedScope.ownerId,
            scopeKey: requestedScope.scopeKey,
            sync: { ...(trip.sync ?? {}), status: "local", revision },
          };
          store.add(storedTrip);
        });
      };
      request.onerror = () => { failure = request.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(storedTrip); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Vycházku se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Založení vycházky bylo přerušeno.")); };
    });
  },
};
