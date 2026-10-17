import { openLocalDatabase, OUTBOX_STORE_NAME, queueOutboxOperation, runStoreOperation } from "../../catches/data/catchRepository.js";

const STORE_NAME = "trips";

export const tripRepository = {
  list: () => runStoreOperation(STORE_NAME, "list", "readonly"),
  get: (id) => runStoreOperation(STORE_NAME, "get", "readonly", id),
  put: async (trip, { ownerId = null } = {}) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      let storedTrip = trip;
      const request = store.get(trip.id);
      request.onsuccess = () => {
        const existing = request.result;
        const effectiveOwnerId = existing ? (existing.ownerId ?? null) : (ownerId || null);
        queueOutboxOperation(transaction, {
          entityType: "trip",
          entityId: trip.id,
          operation: "upsert",
          localRevision: trip.sync?.revision ?? 1,
          ownerId: effectiveOwnerId,
          baseServerRevision: existing?.sync?.serverRevision ?? trip.sync?.serverRevision ?? null,
        }, (revision) => {
          storedTrip = {
            ...trip,
            ownerId: effectiveOwnerId,
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
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Výpravu se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Uložení výpravy bylo přerušeno.")); };
    });
  },
  delete: async (id) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME, "catches", OUTBOX_STORE_NAME], "readwrite");
      const tripStore = transaction.objectStore(STORE_NAME);
      const request = transaction.objectStore("catches").getAll();
      let failure;
      request.onsuccess = () => {
        if (request.result.some((item) => item.tripId === id)) {
          failure = new Error("Výprava obsahuje úlovky a nelze ji smazat.");
          transaction.abort();
          return;
        }
        const tripRequest = tripStore.get(id);
        tripRequest.onsuccess = () => {
          if (!tripRequest.result) return;
          queueOutboxOperation(transaction, {
            entityType: "trip",
            entityId: id,
            operation: "delete",
            localRevision: (tripRequest.result.sync?.revision ?? 0) + 1,
            ownerId: tripRequest.result.ownerId ?? null,
            baseServerRevision: tripRequest.result.sync?.serverRevision ?? null,
          }, () => tripStore.delete(id));
        };
        tripRequest.onerror = () => { failure = tripRequest.error; transaction.abort(); };
      };
      request.onerror = () => { failure = request.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(id); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Výpravu se nepodařilo smazat.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Mazání výpravy bylo přerušeno.")); };
    });
  },
  start: async (trip, { ownerId = null } = {}) => {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      let failure;
      let storedTrip = trip;
      request.onsuccess = () => {
        if (request.result.some((item) => !item.endedAt && (item.ownerId ?? null) === (ownerId ?? null))) {
          failure = new Error("Nejprve ukonči aktivní výpravu.");
          transaction.abort();
          return;
        }
        queueOutboxOperation(transaction, {
          entityType: "trip",
          entityId: trip.id,
          operation: "upsert",
          localRevision: trip.sync?.revision ?? 1,
          ownerId,
          baseServerRevision: trip.sync?.serverRevision ?? null,
        }, (revision) => {
          storedTrip = { ...trip, ownerId: ownerId || null, sync: { ...(trip.sync ?? {}), status: "local", revision } };
          store.add(storedTrip);
        });
      };
      request.onerror = () => { failure = request.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(storedTrip); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Výpravu se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Založení výpravy bylo přerušeno.")); };
    });
  },
};
