import {
  CATCH_STORE_NAME,
  CONFLICT_STORE_NAME,
  OUTBOX_STORE_NAME,
  PRIVACY_STORE_NAME,
  PROGRESSION_EVENT_STORE_NAME,
  SYNC_STATE_STORE_NAME,
  TRIP_STORE_NAME,
  openLocalDatabase,
} from "../../catches/data/catchRepository.js";
import { validateDataScope } from "../../auth/data/localDataScope.js";

function deleteIndexMatches(store, indexName, value) {
  const request = store.index(indexName).openCursor(IDBKeyRange.only(value));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
}

function deleteMatchingRecords(store, matches) {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if (matches(cursor.value)) cursor.delete();
    cursor.continue();
  };
}

async function deleteJournalScope(scope) {
  const db = await openLocalDatabase();
  const stores = [
    CATCH_STORE_NAME,
    TRIP_STORE_NAME,
    OUTBOX_STORE_NAME,
    CONFLICT_STORE_NAME,
    PRIVACY_STORE_NAME,
    PROGRESSION_EVENT_STORE_NAME,
    SYNC_STATE_STORE_NAME,
  ];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, "readwrite");
    deleteIndexMatches(transaction.objectStore(CATCH_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(TRIP_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(OUTBOX_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(PROGRESSION_EVENT_STORE_NAME), "scopeKey", scope.scopeKey);
    transaction.objectStore(PRIVACY_STORE_NAME).delete(scope.scopeKey);
    if (scope.ownerId) transaction.objectStore(SYNC_STATE_STORE_NAME).delete(scope.ownerId);
    deleteMatchingRecords(transaction.objectStore(CONFLICT_STORE_NAME), (record) => (
      scope.ownerId ? record.ownerId === scope.ownerId : record.scopeKey === scope.scopeKey
    ));
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Místní deník se nepodařilo smazat.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Mazání místního deníku bylo přerušeno.")); };
  });
}

function openWatersDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("chytnu-waters", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const waters = db.createObjectStore("waters", { keyPath: "id" });
      waters.createIndex("scopeKey", "scopeKey", { unique: false });
      waters.createIndex("name", "name", { unique: false });
      const chat = db.createObjectStore("waterChat", { keyPath: "id" });
      chat.createIndex("waterId", "waterId", { unique: false });
      chat.createIndex("scopeKey", "scopeKey", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Místní revíry se nepodařilo otevřít."));
  });
}

async function deleteWaterScope(scopeKey) {
  const db = await openWatersDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["waters", "waterChat"], "readwrite");
    deleteIndexMatches(transaction.objectStore("waters"), "scopeKey", scopeKey);
    deleteIndexMatches(transaction.objectStore("waterChat"), "scopeKey", scopeKey);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Místní revíry se nepodařilo smazat.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Mazání místních revírů bylo přerušeno.")); };
  });
}

function deleteScopedPreferences(scopeKey, storage) {
  for (const key of [
    `chytnu:preferences:v1:${scopeKey}`,
    `chytnu:preferences:v1:quickSpecies:${encodeURIComponent(scopeKey)}`,
    `chytnu:trophy-selection:v1:${scopeKey}`,
    `chytnu:onboarding:v1:${scopeKey}`,
  ]) storage?.removeItem(key);
}

export async function deleteLocalScopeData(options, storage = globalThis.localStorage) {
  const scope = validateDataScope(options ?? {});
  await deleteJournalScope(scope);
  await deleteWaterScope(scope.scopeKey);
  try {
    deleteScopedPreferences(scope.scopeKey, storage);
  } catch (error) {
    throw new Error("Data deníku byla smazána, ale místní předvolby se nepodařilo vyčistit.", { cause: error });
  }
}
