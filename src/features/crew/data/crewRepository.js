import { validateDataScope } from "../../auth/data/localDataScope.js";
import { createCrewRecord, updateCrewRecord } from "./crewModel.js";

const DATABASE_NAME = "chytnu-crew-local";
const DATABASE_VERSION = 1;
const CREW_STORE = "crews";

function openCrewDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Místní úložiště Crew není dostupné."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CREW_STORE)) {
        database.createObjectStore(CREW_STORE, { keyPath: "scopeKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Místní úložiště Crew se nepodařilo otevřít."));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, operation) {
  const database = await openCrewDatabase();
  try {
    const transaction = database.transaction(CREW_STORE, mode);
    return await operation(transaction.objectStore(CREW_STORE));
  } finally {
    database.close();
  }
}

function requireOwnedCrew(record, crewId, scope) {
  if (!record || record.id !== crewId || record.scopeKey !== scope.scopeKey || record.ownerId !== scope.ownerId) {
    throw new Error("Crew nepatří aktivnímu profilu.");
  }
  return record;
}

export const crewRepository = {
  async get(scopeOptions) {
    const scope = validateDataScope(scopeOptions ?? {});
    return await withStore("readonly", (store) => requestValue(store.get(scope.scopeKey))) ?? null;
  },

  async create(input, scopeOptions) {
    const scope = validateDataScope(scopeOptions ?? {});
    return withStore("readwrite", async (store) => {
      const existing = await requestValue(store.get(scope.scopeKey));
      if (existing) throw new Error("Aktivní profil už má místní Crew.");
      const record = createCrewRecord(input, scope);
      await requestValue(store.add(record));
      return record;
    });
  },

  async update(crewId, input, scopeOptions) {
    const scope = validateDataScope(scopeOptions ?? {});
    return withStore("readwrite", async (store) => {
      const existing = requireOwnedCrew(await requestValue(store.get(scope.scopeKey)), crewId, scope);
      const record = updateCrewRecord(existing, input);
      await requestValue(store.put(record));
      return record;
    });
  },

  async deleteOwn(crewId, scopeOptions) {
    const scope = validateDataScope(scopeOptions ?? {});
    return withStore("readwrite", async (store) => {
      requireOwnedCrew(await requestValue(store.get(scope.scopeKey)), crewId, scope);
      await requestValue(store.delete(scope.scopeKey));
      return true;
    });
  },

  async clearLocalScope(scopeOptions) {
    const scope = validateDataScope(scopeOptions ?? {});
    return withStore("readwrite", async (store) => {
      const record = await requestValue(store.get(scope.scopeKey));
      if (!record) return false;
      if (record.scopeKey !== scope.scopeKey || record.ownerId !== scope.ownerId) return false;
      await requestValue(store.delete(scope.scopeKey));
      return true;
    });
  },

  async leave(crewId, scopeOptions) {
    return this.deleteOwn(crewId, scopeOptions);
  },
};
