import {
  openLocalDatabase, PRIVACY_STORE_NAME, PROGRESSION_EVENT_STORE_NAME, NOTIFICATION_STORE_NAME, PHOTO_BINARY_STORE_NAME,
} from "../../catches/data/catchRepository.js";
import { validateDataScope } from "../../auth/data/localDataScope.js";

export function readLocalBackupSnapshot(options) {
  const { scopeKey } = validateDataScope(options ?? {});
  return openLocalDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(["catches", "trips", PRIVACY_STORE_NAME, PROGRESSION_EVENT_STORE_NAME, NOTIFICATION_STORE_NAME, PHOTO_BINARY_STORE_NAME], "readonly");
    const catchesRequest = transaction.objectStore("catches").index("scopeKey").getAll(scopeKey);
    const tripsRequest = transaction.objectStore("trips").index("scopeKey").getAll(scopeKey);
    const privacyRequest = transaction.objectStore(PRIVACY_STORE_NAME).get(scopeKey);
    const progressionRequest = transaction.objectStore(PROGRESSION_EVENT_STORE_NAME).index("scopeKey").getAll(scopeKey);
    const notificationsRequest = transaction.objectStore(NOTIFICATION_STORE_NAME).index("scopeKey").getAll(scopeKey);
    const photoBinariesRequest = transaction.objectStore(PHOTO_BINARY_STORE_NAME).index("scopeKey").getAll(scopeKey);
    let catches;
    let trips;
    let privacySettings;
    let progressionEvents;
    let notifications;
    let photoBinaries;
    let failure;

    catchesRequest.onsuccess = () => { catches = catchesRequest.result; };
    tripsRequest.onsuccess = () => { trips = tripsRequest.result; };
    privacyRequest.onsuccess = () => { privacySettings = privacyRequest.result ?? null; };
    progressionRequest.onsuccess = () => { progressionEvents = progressionRequest.result; };
    notificationsRequest.onsuccess = () => { notifications = notificationsRequest.result; };
    photoBinariesRequest.onsuccess = () => { photoBinaries = photoBinariesRequest.result; };
    catchesRequest.onerror = () => { failure = catchesRequest.error; transaction.abort(); };
    tripsRequest.onerror = () => { failure = tripsRequest.error; transaction.abort(); };
    privacyRequest.onerror = () => { failure = privacyRequest.error; transaction.abort(); };
    progressionRequest.onerror = () => { failure = progressionRequest.error; transaction.abort(); };
    notificationsRequest.onerror = () => { failure = notificationsRequest.error; transaction.abort(); };
    photoBinariesRequest.onerror = () => { failure = photoBinariesRequest.error; transaction.abort(); };
    transaction.oncomplete = () => {
      db.close();
      const photoByKey = new Map(photoBinaries.map((photo) => [JSON.stringify([photo.scopeKey, photo.catchId, photo.photoId]), photo]));
      const catchesWithPhotos = catches.map((record) => ({
        ...record,
        photos: (record.photos ?? []).map((photo) => {
          if (photo.blob instanceof Blob) return photo;
          const saved = photoByKey.get(JSON.stringify([scopeKey, record.id, photo.id]));
          if (!saved || !(saved.bytes instanceof ArrayBuffer || ArrayBuffer.isView(saved.bytes))) return photo;
          return { ...photo, blob: new Blob([saved.bytes], { type: saved.type || photo.type || "application/octet-stream" }) };
        }),
      }));
      resolve({ catches: catchesWithPhotos, trips, privacySettings, progressionEvents, notifications });
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
