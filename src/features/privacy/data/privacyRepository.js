import { openLocalDatabase, PRIVACY_STORE_NAME } from "../../catches/data/catchRepository.js";
import { validateDataScope } from "../../auth/data/localDataScope.js";
import { DEFAULT_PRIVACY_SETTINGS, normalizePrivacySettings } from "./privacyModel.js";

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const privacyRepository = {
  async get(options) {
    const scope = validateDataScope(options ?? {});
    const db = await openLocalDatabase();
    try {
      const transaction = db.transaction(PRIVACY_STORE_NAME, "readonly");
      const stored = await requestValue(transaction.objectStore(PRIVACY_STORE_NAME).get(scope.scopeKey));
      return {
        ...DEFAULT_PRIVACY_SETTINGS,
        ...normalizePrivacySettings(stored),
        scopeKey: scope.scopeKey,
        ownerId: scope.ownerId,
        hasSavedSettings: Boolean(stored),
      };
    } finally { db.close(); }
  },

  async put(settings, options) {
    const scope = validateDataScope(options ?? {});
    const record = {
      ...normalizePrivacySettings(settings), scopeKey: scope.scopeKey, ownerId: scope.ownerId,
      updatedAt: new Date().toISOString(),
    };
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PRIVACY_STORE_NAME, "readwrite");
      transaction.objectStore(PRIVACY_STORE_NAME).put(record);
      transaction.oncomplete = () => { db.close(); resolve(record); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Nastavení soukromí se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Uložení soukromí bylo přerušeno.")); };
    });
  },
};
