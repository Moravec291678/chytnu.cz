import {
  CATCH_STORE_NAME,
  CONFLICT_STORE_NAME,
  LOCAL_PROFILE_STORE_NAME,
  OUTBOX_STORE_NAME,
  PRIVACY_STORE_NAME,
  PROGRESSION_EVENT_STORE_NAME,
  NOTIFICATION_STORE_NAME,
  PHOTO_BINARY_STORE_NAME,
  SERVER_PROGRESSION_CLAIM_STORE_NAME,
  SYNC_STATE_STORE_NAME,
  TRIP_STORE_NAME,
  WATER_STORE_NAME,
  WATER_CHAT_STORE_NAME,
  clearSessionPhotoBlobsForScope,
  openLocalDatabase,
} from "../../catches/data/catchRepository.js";
import { catchDraftRepository } from "../../catches/data/catchDraftRepository.js";
import { validateDataScope } from "../../auth/data/localDataScope.js";
import { crewRepository } from "../../crew/data/crewRepository.js";
import { communityInteractionRepository } from "../../community/data/communityInteractionRepository.js";
import { clearLegacyLocalScope } from "../../waters/data/waterRepository.js";

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
    NOTIFICATION_STORE_NAME,
    SERVER_PROGRESSION_CLAIM_STORE_NAME,
    LOCAL_PROFILE_STORE_NAME,
    SYNC_STATE_STORE_NAME,
    WATER_STORE_NAME,
    WATER_CHAT_STORE_NAME,
    PHOTO_BINARY_STORE_NAME,
  ];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, "readwrite");
    deleteIndexMatches(transaction.objectStore(CATCH_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(TRIP_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(WATER_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(WATER_CHAT_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(PHOTO_BINARY_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(OUTBOX_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(PROGRESSION_EVENT_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(NOTIFICATION_STORE_NAME), "scopeKey", scope.scopeKey);
    deleteIndexMatches(transaction.objectStore(SERVER_PROGRESSION_CLAIM_STORE_NAME), "scopeKey", scope.scopeKey);
    transaction.objectStore(PRIVACY_STORE_NAME).delete(scope.scopeKey);
    transaction.objectStore(LOCAL_PROFILE_STORE_NAME).delete(scope.scopeKey);
    if (scope.ownerId) transaction.objectStore(SYNC_STATE_STORE_NAME).delete(scope.ownerId);
    deleteMatchingRecords(transaction.objectStore(CONFLICT_STORE_NAME), (record) => (
      scope.ownerId ? record.ownerId === scope.ownerId : record.scopeKey === scope.scopeKey
    ));
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Místní deník se nepodařilo smazat.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Mazání místního deníku bylo přerušeno.")); };
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
  // Drafts live in their own IndexedDB database and may contain photo Blobs.
  await catchDraftRepository.remove(scope);
  await deleteJournalScope(scope);
  await Promise.all([
    crewRepository.clearLocalScope(scope),
    communityInteractionRepository.clearLocalScope(scope),
    clearLegacyLocalScope(scope),
  ]);
  clearSessionPhotoBlobsForScope(scope.scopeKey);
  try {
    deleteScopedPreferences(scope.scopeKey, storage);
  } catch (error) {
    throw new Error("Data deníku byla smazána, ale místní předvolby se nepodařilo vyčistit.", { cause: error });
  }
}
