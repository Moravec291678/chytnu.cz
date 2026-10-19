import {
  CATCH_STORE_NAME, TRIP_STORE_NAME, PRIVACY_STORE_NAME,
  PROGRESSION_EVENT_STORE_NAME, openLocalDatabase,
} from "../../catches/data/catchRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";

export function hasScopedRecords(records, scopeKey) {
  return records.some((record) => record?.scopeKey === scopeKey);
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Místní profil se nepodařilo načíst."));
  });
}

export async function hasLegacyProfileData(scopeKey) {
  if (!scopeKey) return false;
  const db = await openLocalDatabase();
  try {
    const names = [CATCH_STORE_NAME, TRIP_STORE_NAME, PRIVACY_STORE_NAME, PROGRESSION_EVENT_STORE_NAME]
      .filter((name) => db.objectStoreNames.contains(name));
    if (!names.length) return false;
    const transaction = db.transaction(names, "readonly");
    const requests = names.map((name) => {
      const store = transaction.objectStore(name);
      return name === PRIVACY_STORE_NAME ? requestValue(store.get(scopeKey)) : requestValue(store.getAll());
    });
    const rows = await Promise.all(requests);
    const scopedStoreData = rows.some((value, index) => names[index] === PRIVACY_STORE_NAME
      ? value?.scopeKey === scopeKey
      : hasScopedRecords(value, scopeKey));
    const ownerId = scopeKey.startsWith("account:") ? scopeKey.slice("account:".length) : null;
    const waters = await waterRepository.list({ scopeKey, ownerId });
    return scopedStoreData || waters.length > 0;
  } finally { db.close(); }
}
