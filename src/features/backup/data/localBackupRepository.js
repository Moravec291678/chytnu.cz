import {
  openLocalDatabase, PRIVACY_STORE_NAME, PROGRESSION_EVENT_STORE_NAME, NOTIFICATION_STORE_NAME, PHOTO_BINARY_STORE_NAME,
} from "../../catches/data/catchRepository.js";
import { validateDataScope } from "../../auth/data/localDataScope.js";
import { readPreferences } from "../../preferences/data/preferences.js";
import { readQuickSpeciesIds } from "../../preferences/data/quickSpeciesPreferences.js";
import { readTrophySelection } from "../../species/data/trophySelection.js";
import { serverProgressionClaimRepository } from "../../progression/data/serverProgressionClaimRepository.js";

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

/** Reads only account-scoped preferences and local progression/inbox state to supplement a cloud export. */
export async function readCloudExportDeviceSupplement(options, storage = globalThis.localStorage) {
  const scope = validateDataScope(options ?? {});
  const db = await openLocalDatabase();
  const local = await new Promise((resolve, reject) => {
    const stores = [PRIVACY_STORE_NAME, PROGRESSION_EVENT_STORE_NAME, NOTIFICATION_STORE_NAME];
    const transaction = db.transaction(stores, "readonly");
    const privacyRequest = transaction.objectStore(PRIVACY_STORE_NAME).get(scope.scopeKey);
    const eventsRequest = transaction.objectStore(PROGRESSION_EVENT_STORE_NAME).index("scopeKey").getAll(scope.scopeKey);
    const notificationsRequest = transaction.objectStore(NOTIFICATION_STORE_NAME).index("scopeKey").getAll(scope.scopeKey);
    let values;
    let failure;
    transaction.oncomplete = () => {
      db.close();
      values = values ?? {};
      resolve({
        privacySettings: values.privacySettings ?? null,
        progressionEvents: values.progressionEvents ?? [],
        notifications: values.notifications ?? [],
      });
    };
    for (const [request, key] of [[privacyRequest, "privacySettings"], [eventsRequest, "progressionEvents"], [notificationsRequest, "notifications"]]) {
      request.onsuccess = () => { values = { ...values, [key]: request.result ?? (key === "privacySettings" ? null : []) }; };
      request.onerror = () => { failure = request.error; try { transaction.abort(); } catch { /* already finished */ } };
    }
    transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Místní profilová data se nepodařilo načíst.")); };
    transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Načtení místních profilových dat bylo přerušeno.")); };
  });
  const progressionClaims = scope.ownerId ? await serverProgressionClaimRepository.list(scope.ownerId) : [];
  const localProgressionXp = local.progressionEvents.reduce((total, event) => (
    total + (Number.isSafeInteger(event.xp) && event.xp > 0 ? event.xp : 0)
  ), 0);
  return {
    source: "current-device-profile-scope",
    note: "Tato část pochází pouze z aktuálního zařízení; není součástí serverového snapshotu účtu.",
    preferences: {
      general: readPreferences(storage, scope.scopeKey),
      quickSpeciesIds: readQuickSpeciesIds(scope.scopeKey, storage),
      trophySelection: readTrophySelection(scope.scopeKey, storage),
    },
    privacySettings: local.privacySettings,
    progressionEvents: local.progressionEvents,
    progressionSummary: {
      xpFromLocalEvents: localProgressionXp,
      unlockedAchievementIds: [...new Set(local.progressionEvents
        .filter((event) => event.type === "achievement.unlocked")
        .map((event) => event.reasonKey?.slice("achievement.unlocked:".length)).filter(Boolean))],
      completedChallengeRewardIds: local.progressionEvents
        .filter((event) => event.type === "challenge.completed")
        .map((event) => event.reasonKey).filter(Boolean),
      masteryEvents: local.progressionEvents.filter((event) => event.type === "mastery.milestone"),
      streakEvents: local.progressionEvents.filter((event) => (event.type ?? "").startsWith("streak.")),
    },
    notifications: local.notifications,
    pendingProgressionClaims: progressionClaims,
  };
}
