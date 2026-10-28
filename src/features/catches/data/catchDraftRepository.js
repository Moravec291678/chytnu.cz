import { validateDataScope } from "../../auth/data/localDataScope.js";

const DATABASE_NAME = "chytnu-catch-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
export const CATCH_DRAFT_VERSION = 1;
export const CATCH_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const pendingByScope = new Map();

function openDraftDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Místní úložiště rozepsaného úlovku není dostupné."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "scopeKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Rozepsaný úlovek se nepodařilo otevřít."));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Rozepsaný úlovek se nepodařilo načíst."));
  });
}

function enqueue(scopeKey, operation) {
  const previous = pendingByScope.get(scopeKey) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  pendingByScope.set(scopeKey, next);
  next.finally(() => {
    if (pendingByScope.get(scopeKey) === next) pendingByScope.delete(scopeKey);
  }).catch(() => {});
  return next;
}

function withoutPreviewUrls(data) {
  return {
    ...data,
    photos: (data.photos ?? []).map((photo) => Object.fromEntries(
      Object.entries(photo).filter(([key]) => key !== "previewUrl"),
    )),
  };
}

async function openStore(mode, operation) {
  const database = await openDraftDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const result = await operation(transaction.objectStore(STORE_NAME));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Rozepsaný úlovek se nepodařilo uložit."));
      transaction.onabort = () => reject(transaction.error || new Error("Uložení rozepsaného úlovku bylo přerušeno."));
    });
    return result;
  } finally {
    database.close();
  }
}

async function removeExpired(store, now) {
  const records = await requestValue(store.getAll());
  for (const record of records) {
    const expiry = Date.parse(record.expiresAt);
    if (record.version !== CATCH_DRAFT_VERSION || !Number.isFinite(expiry) || expiry <= now) {
      store.delete(record.scopeKey);
    }
  }
}

export const catchDraftRepository = {
  get(scopeOptions, now = Date.now()) {
    const scope = validateDataScope(scopeOptions ?? {});
    return enqueue(scope.scopeKey, () => openStore("readwrite", async (store) => {
      await removeExpired(store, now);
      return (await requestValue(store.get(scope.scopeKey))) ?? null;
    }));
  },

  save(data, uiState, scopeOptions, now = Date.now()) {
    const scope = validateDataScope(scopeOptions ?? {});
    return enqueue(scope.scopeKey, () => openStore("readwrite", async (store) => {
      await removeExpired(store, now);
      const updatedAt = new Date(now).toISOString();
      const record = {
        scopeKey: scope.scopeKey,
        ownerId: scope.ownerId,
        version: CATCH_DRAFT_VERSION,
        updatedAt,
        expiresAt: new Date(now + CATCH_DRAFT_TTL_MS).toISOString(),
        data: withoutPreviewUrls(data),
        uiState: { ...uiState },
      };
      await requestValue(store.put(record));
      return record;
    }));
  },

  remove(scopeOptions) {
    const scope = validateDataScope(scopeOptions ?? {});
    return enqueue(scope.scopeKey, () => openStore("readwrite", (store) => requestValue(store.delete(scope.scopeKey))));
  },
};
