import {
  openLocalDatabase, PRIVACY_STORE_NAME, PROGRESSION_EVENT_STORE_NAME,
} from "../../catches/data/catchRepository.js";
import { validateDataScope } from "../../auth/data/localDataScope.js";

export function readLocalBackupSnapshot(options) {
  const { scopeKey } = validateDataScope(options ?? {});
  return openLocalDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(["catches", "trips", PRIVACY_STORE_NAME, PROGRESSION_EVENT_STORE_NAME], "readonly");
    const catchesRequest = transaction.objectStore("catches").index("scopeKey").getAll(scopeKey);
    const tripsRequest = transaction.objectStore("trips").index("scopeKey").getAll(scopeKey);
    const privacyRequest = transaction.objectStore(PRIVACY_STORE_NAME).get(scopeKey);
    const progressionRequest = transaction.objectStore(PROGRESSION_EVENT_STORE_NAME).index("scopeKey").getAll(scopeKey);
    let catches;
    let trips;
    let privacySettings;
    let progressionEvents;
    let failure;

    catchesRequest.onsuccess = () => { catches = catchesRequest.result; };
    tripsRequest.onsuccess = () => { trips = tripsRequest.result; };
    privacyRequest.onsuccess = () => { privacySettings = privacyRequest.result ?? null; };
    progressionRequest.onsuccess = () => { progressionEvents = progressionRequest.result; };
    catchesRequest.onerror = () => { failure = catchesRequest.error; transaction.abort(); };
    tripsRequest.onerror = () => { failure = tripsRequest.error; transaction.abort(); };
    privacyRequest.onerror = () => { failure = privacyRequest.error; transaction.abort(); };
    progressionRequest.onerror = () => { failure = progressionRequest.error; transaction.abort(); };
    transaction.oncomplete = () => {
      db.close();
      resolve({ catches, trips, privacySettings, progressionEvents });
    };
    transaction.onerror = () => {
      db.close();
      reject(failure ?? transaction.error ?? new Error("Místní data se nepodařilo načíst."));
    };
    transaction.onabort = () => {
      db.close();
      reject(failure ?? transaction.error ?? new Error("Načtení místních dat bylo přerušeno."));
    };
  }));
}
