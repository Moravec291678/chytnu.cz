import {
  collection, connectFirestoreEmulator, documentId, getDocsFromServer, getFirestore, limit, orderBy, query, startAfter, where,
} from "firebase/firestore";
import { firebaseAuth, getLocalFirebaseApp } from "../../auth/data/firebaseAuth.js";
import { getBackendConfiguration } from "../../auth/data/backendConfig.js";
import { resolveApiUrl } from "../../../platform/api.js";
import { calculateProgression } from "../../progression/data/progression.js";
import { buildChallengeOverview } from "../../progression/data/challenges.js";
import { buildSeasonalChallenge } from "../../progression/data/seasonalChallenge.js";
import { summaryForXp } from "../../progression/data/progressionLedger.js";

export const CLOUD_ACCOUNT_EXPORT_FORMAT = "chytnucz-account-export";
export const CLOUD_ACCOUNT_EXPORT_VERSION = 1;
const PAGE_SIZE = 200;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const EMULATOR_CONNECTIONS = Symbol.for("chytnucz.firebaseEmulatorConnections");
const SYNC_INTERNAL_FIELDS = ["ownerId", "serverRevision", "syncSequence", "lastOperationId", "clientLocalRevision",
  "operationDigest", "lastReceiptId", "photoState", "sync"];

function portableRecord(record) {
  const value = { ...record };
  for (const key of SYNC_INTERNAL_FIELDS) delete value[key];
  if (value.verification && typeof value.verification === "object") {
    value.verification = { ...value.verification };
    delete value.verification.photoHash;
  }
  return value;
}

function portableNotification(record) {
  return Object.fromEntries(["id", "type", "title", "body", "createdAt", "readAt", "deepLink"]
    .filter((key) => record?.[key] !== undefined).map((key) => [key, record[key]]));
}

function portablePhotoMetadata(id, data) {
  return Object.fromEntries(["name", "type", "size", "focalX", "focalY", "zoom", "sortIndex", "deletedAt"]
    .filter((key) => data?.[key] !== undefined).map((key) => [key, data[key]]).concat([["id", id]]));
}

function portableProgressionEvent(event) {
  return Object.fromEntries(["id", "eventId", "catchId", "type", "xp", "verificationLevel", "createdAt"]
    .filter((key) => event?.[key] !== undefined).map((key) => [key, event[key]]));
}

function portableDeviceSupplement(supplement) {
  if (!supplement) return null;
  const privacySettings = supplement.privacySettings ? { ...supplement.privacySettings } : null;
  if (privacySettings) {
    delete privacySettings.ownerId;
    delete privacySettings.scopeKey;
  }
  return {
    source: supplement.source,
    note: supplement.note,
    preferences: supplement.preferences ?? null,
    privacySettings,
    progressionEvents: (supplement.progressionEvents ?? []).map(portableProgressionEvent),
    progressionSummary: supplement.progressionSummary ?? null,
    notifications: (supplement.notifications ?? []).map(portableNotification),
  };
}

function assertOwner(ownerId, currentOwnerId) {
  if (!ownerId || currentOwnerId() !== ownerId) {
    throw new Error("Přihlášený účet se změnil. Export byl zastaven.");
  }
}

function encodeBytes(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const triplet = (bytes[index] << 16) | ((hasSecond ? bytes[index + 1] : 0) << 8) | (hasThird ? bytes[index + 2] : 0);
    output += alphabet[(triplet >> 18) & 63] + alphabet[(triplet >> 12) & 63]
      + (hasSecond ? alphabet[(triplet >> 6) & 63] : "=") + (hasThird ? alphabet[triplet & 63] : "=");
  }
  return output;
}

function jsonSafe(value) {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return null;
}

function fingerprint(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("Toto zařízení neumí ověřit staženou fotografii.");
  return globalThis.crypto.subtle.digest("SHA-256", bytes).then((digest) => [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0")).join(""));
}

export function createCloudAccountExportService({
  getCollectionPage,
  downloadPhoto,
  currentOwnerId = () => firebaseAuth.currentUserId(),
  now = () => new Date(),
  pageSize = PAGE_SIZE,
} = {}) {
  if (typeof getCollectionPage !== "function" || typeof downloadPhoto !== "function") {
    throw new TypeError("Cloud export vyžaduje čtení Firestore a stažení fotografií.");
  }

  async function listCollection(ownerId, collectionName, onPage, { ownerFieldRequired = true } = {}) {
    const items = [];
    let cursor = null;
    while (true) {
      assertOwner(ownerId, currentOwnerId);
      const page = await getCollectionPage({ ownerId, collectionName, cursor, pageSize });
      assertOwner(ownerId, currentOwnerId);
      for (const item of page.items) {
        if ((ownerFieldRequired && item.data?.ownerId !== ownerId)
          || (item.data?.id != null && item.data.id !== item.id)) {
          throw new Error(`Cloudový záznam ${collectionName}/${item.id} nemá platného vlastníka.`);
        }
        items.push({ id: item.id, data: { ...jsonSafe(item.data), id: item.id } });
      }
      onPage?.(items.length);
      if (page.done) return items;
      if (page.cursor == null || page.cursor === cursor) throw new Error(`Načítání ${collectionName} se nepodařilo bezpečně stránkovat.`);
      cursor = page.cursor;
    }
  }

  async function exportAccount({ ownerId, user = null, email = user?.email ?? null, deviceSupplement = null, onProgress = () => {} }) {
    assertOwner(ownerId, currentOwnerId);
    if (user?.uid && user.uid !== ownerId) throw new Error("Přihlášený účet neodpovídá vlastníkovi exportu.");
    onProgress({ phase: "records" });
    const names = ["catches", "trips", "waters", "notifications", "serverProgressionEvents", "serverProgressionState"];
    const collections = {};
    for (const name of names) {
      collections[name] = await listCollection(ownerId, name, (count) => onProgress({ phase: "records", collection: name, count }));
    }

    const activeCatches = [];
    const deletedRecords = [];
    for (const item of collections.catches) {
      if (item.data.deleted === true) {
        deletedRecords.push({ entityType: "catch", id: item.id, deletedAt: item.data.deletedAt ?? null });
        continue;
      }
      activeCatches.push({ ...portableRecord(item.data), photos: Array.isArray(item.data.photos) ? item.data.photos : [] });
    }
    for (const type of ["trips", "waters"]) {
      collections[type] = collections[type].filter((item) => {
        if (item.data.deleted !== true) return true;
        deletedRecords.push({ entityType: type === "trips" ? "trip" : "water", id: item.id, deletedAt: item.data.deletedAt ?? null });
        return false;
      }).map((item) => item.data);
    }

    const warnings = [];
    let photoCount = 0;
    const photoCollections = [];
    for (const catchRecord of activeCatches) {
      const photoItems = await listCollection(ownerId, `catches/${catchRecord.id}/photos`,
        (count) => onProgress({ phase: "photos", catchId: catchRecord.id, count }), { ownerFieldRequired: false });
      const legacyPhotoMap = new Map((Array.isArray(catchRecord.photos) ? catchRecord.photos : [])
        .filter((photo) => typeof photo?.id === "string").map((photo) => [photo.id, photo]));
      const referencedIds = catchRecord.photoRefs
        ? Object.entries(catchRecord.photoRefs).filter(([, active]) => active === true).map(([id]) => id)
        : [...legacyPhotoMap.keys()];
      const photoMap = new Map([...legacyPhotoMap, ...photoItems.map((item) => [item.id, item.data])]);
      const photos = [];
      for (const photoId of referencedIds) {
        assertOwner(ownerId, currentOwnerId);
        const metadata = photoMap.get(photoId);
        if (!metadata || metadata.deleted === true) {
          warnings.push({ catchId: catchRecord.id, photoId, reason: "cloud_metadata_missing" });
          photos.push({ id: photoId, availability: "metadata-missing", dataBase64: null });
          continue;
        }
        const photo = portablePhotoMetadata(photoId, metadata);
        const cloudMetadata = metadata.cloud;
        if (cloudMetadata?.state === "synced" && cloudMetadata.provider === "cloudinary") {
          try {
            const bytes = await downloadPhoto({ ownerId, catchId: catchRecord.id, photoId, metadata: photo });
            if (!(bytes instanceof Uint8Array) || bytes.byteLength !== photo.size || bytes.byteLength > MAX_PHOTO_BYTES) {
              throw Object.assign(new Error("Photo size mismatch."), { code: "photo_size_mismatch" });
            }
            const hash = await fingerprint(bytes);
            if (hash !== cloudMetadata.sha256) throw Object.assign(new Error("Photo hash mismatch."), { code: "photo_hash_mismatch" });
            photo.dataBase64 = encodeBytes(bytes);
            photo.availability = "included";
          } catch (error) {
            if (currentOwnerId() !== ownerId) throw new Error("Přihlášený účet se změnil. Export byl zastaven.", { cause: error });
            const reason = typeof error?.code === "string" && /^[a-z0-9_-]{1,64}$/.test(error.code)
              ? error.code : "photo_download_failed";
            warnings.push({ catchId: catchRecord.id, photoId, reason });
            photo.dataBase64 = null;
            photo.availability = "cloud-download-failed";
          }
        } else {
          photo.dataBase64 = null;
          photo.availability = cloudMetadata?.state === "localOnly" ? "not-stored-in-cloud" : "cloud-copy-unavailable";
          warnings.push({ catchId: catchRecord.id, photoId, reason: photo.availability });
        }
        photos.push(photo);
        photoCount += 1;
        onProgress({ phase: "photos", catchId: catchRecord.id, completed: photoCount });
      }
      const referencedSet = new Set(referencedIds);
      for (const [photoId, metadata] of photoMap) {
        if (referencedSet.has(photoId) || metadata.deleted === true) continue;
        const orphanPhoto = { ...portablePhotoMetadata(photoId, metadata), availability: "not-linked-to-catch", dataBase64: null };
        photos.push(orphanPhoto);
        warnings.push({ catchId: catchRecord.id, photoId, reason: "photo_not_linked_to_catch" });
        photoCount += 1;
        onProgress({ phase: "photos", catchId: catchRecord.id, completed: photoCount });
      }
      catchRecord.photos = photos;
      delete catchRecord.photoRefs;
      photoCollections.push({ catchId: catchRecord.id, removedPhotoMetadata: photoItems
        .filter((item) => item.data.deleted === true).map(({ id, data }) => portablePhotoMetadata(id, data)) });
    }
    assertOwner(ownerId, currentOwnerId);
    const exportedAt = now().toISOString();
    const progressionEvents = collections.serverProgressionEvents.map((item) => item.data);
    const serverState = collections.serverProgressionState.map((item) => item.data);
    const serverSummary = serverState.find((item) => item.id === "summary") ?? serverState[0] ?? null;
    const serverEventXp = progressionEvents.reduce((total, event) => total + (Number.isSafeInteger(event.xp) && event.xp > 0 ? event.xp : 0), 0);
    const progressionTotalXp = Math.max(0, Number(serverSummary?.legacyBaselineXp) || 0) + serverEventXp;
    const cloudDerivedProgression = calculateProgression(activeCatches, collections.trips.map((item) => item.data ?? item), { now: now() });
    const challengeOverview = buildChallengeOverview(activeCatches, collections.trips.map((item) => item.data ?? item), now());
    const seasonalChallenge = buildSeasonalChallenge(activeCatches, now());
    return {
      format: CLOUD_ACCOUNT_EXPORT_FORMAT,
      version: CLOUD_ACCOUNT_EXPORT_VERSION,
      formatVersion: CLOUD_ACCOUNT_EXPORT_VERSION,
      generatedAt: exportedAt,
      exportedAt,
      account: {
        uid: ownerId,
        email: typeof email === "string" ? email : null,
        displayName: typeof user?.displayName === "string" ? user.displayName : null,
        emailVerified: Boolean(user?.emailVerified),
        providers: (user?.providerData ?? []).map((provider) => ({
          providerId: provider.providerId,
          email: provider.email ?? null,
          displayName: provider.displayName ?? null,
        })),
        createdAt: user?.metadata?.creationTime ?? null,
        lastSignInAt: user?.metadata?.lastSignInTime ?? null,
      },
      source: "firebase-firestore-cloudinary",
      consistency: "Kolekce se čtou ze serveru postupně; nejde o atomický databázový snapshot.",
      coverage: {
        catches: activeCatches.length,
        trips: collections.trips.length,
        waters: collections.waters.length,
        notifications: collections.notifications.length,
        photos: photoCount,
        photosWithoutCloudBinary: warnings.length,
        warningCount: warnings.length,
        note: "Export obsahuje aktuální cloudový stav. Nesynchronizované změny a soubory uložené pouze na zařízení nejsou zahrnuty.",
      },
      records: {
        catches: activeCatches,
        trips: collections.trips.map((item) => portableRecord(item.data ?? item)),
        waters: collections.waters.map((item) => portableRecord(item.data ?? item)),
        notifications: collections.notifications.map((item) => portableNotification(item.data ?? item)),
        deletedRecords,
        deletedPhotos: photoCollections,
        progression: {
          totalXp: progressionTotalXp,
          ...summaryForXp(progressionTotalXp),
          cloudDerived: {
            achievements: cloudDerivedProgression.achievements,
            mastery: cloudDerivedProgression.mastery,
            streak: cloudDerivedProgression.streak,
            challenges: challengeOverview,
            seasonalChallenge,
          },
          events: progressionEvents.map(portableProgressionEvent),
          state: serverSummary ? Object.fromEntries(["legacyBaselineXp", "createdAt", "updatedAt", "schemaVersion"]
            .filter((key) => serverSummary[key] !== undefined).map((key) => [key, serverSummary[key]])) : null,
        },
        deviceLocal: jsonSafe(portableDeviceSupplement(deviceSupplement)),
      },
      excludedInternalData: [
        "Push subscription endpoints and encryption keys",
        "Photo duplicate-claim hashes and anti-cheat claim state",
        "Per-catch server verification internals and Limited XP cap counters",
        "Server rate-limit counters and provider credentials",
        "Sync cursors, operation receipts and pending local claim queue",
      ],
      warnings,
    };
  }
  return Object.freeze({ exportAccount });
}

function firestoreForExport() {
  const app = getLocalFirebaseApp();
  const db = getFirestore(app);
  globalThis[EMULATOR_CONNECTIONS] ??= new Set();
  const key = `firestore:${app.name}`;
  if (getBackendConfiguration().mode === "emulator" && !globalThis[EMULATOR_CONNECTIONS].has(key)) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    globalThis[EMULATOR_CONNECTIONS].add(key);
  }
  return db;
}

async function readCollectionPage({ ownerId, collectionName, cursor, pageSize }) {
  const db = firestoreForExport();
  const path = collectionName.split("/");
  const base = collection(db, "users", ownerId, ...path);
  const constraints = [orderBy(documentId()), limit(pageSize)];
  if (!collectionName.endsWith("/photos")) constraints.unshift(where("ownerId", "==", ownerId));
  if (cursor) constraints.unshift(startAfter(cursor));
  const snapshot = await getDocsFromServer(query(base, ...constraints));
  return {
    items: snapshot.docs.map((document) => ({ id: document.id, data: document.data(), cursor: document })),
    cursor: snapshot.docs.at(-1) ?? null,
    done: snapshot.size < pageSize,
  };
}

async function downloadCloudPhoto({ ownerId, catchId, photoId, metadata }) {
  if (firebaseAuth.currentUserId() !== ownerId) throw new Error("Přihlášený účet se změnil. Export byl zastaven.");
  let token = await firebaseAuth.currentIdToken();
  const send = (idToken) => fetch(resolveApiUrl("/api/cloudinary/export"), {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ catchId, photoId }),
  });
  let response = await send(token);
  if (response.status === 401) {
    token = await firebaseAuth.currentIdToken(true);
    response = await send(token);
  }
  if (!response.ok) throw Object.assign(new Error("Stažení cloudové fotografie se nezdařilo."), { code: `photo_http_${response.status}` });
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== metadata.size || buffer.byteLength > MAX_PHOTO_BYTES) throw new Error("photo_size_mismatch");
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType && contentType !== metadata.type) throw new Error("photo_type_mismatch");
  return new Uint8Array(buffer);
}

export const cloudAccountExportService = createCloudAccountExportService({
  getCollectionPage: readCollectionPage,
  downloadPhoto: downloadCloudPhoto,
});
