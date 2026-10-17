import { openLocalDatabase, OUTBOX_STORE_NAME, queueOutboxOperation } from "../../catches/data/catchRepository.js";
import { LOCAL_BACKUP_FORMAT, LOCAL_BACKUP_VERSION } from "./backupFormat.js";

export const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_SYNC_STATUSES = new Set(["local", "metadata-synced"]);
const STORES = ["catches", "trips", OUTBOX_STORE_NAME];

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`Záloha obsahuje neplatné pole ${label}.`);
}

function requireTimestamp(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail(`Záloha obsahuje neplatné datum v poli ${label}.`);
  }
}

function requireOptionalNumber(value, label) {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    fail(`Záloha obsahuje neplatnou číselnou hodnotu v poli ${label}.`);
  }
}

function decodeBase64(value, label) {
  if (typeof value !== "string" || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail(`Fotografii ${label} se nepodařilo bezpečně dekódovat.`);
  }
  let binary;
  try {
    binary = atob(value);
  } catch {
    fail(`Fotografii ${label} se nepodařilo bezpečně dekódovat.`);
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes;
}

function decodePhoto(photo, catchId) {
  if (!isRecord(photo)) fail(`Záloha obsahuje neplatnou fotografii u úlovku ${catchId}.`);
  requireString(photo.id, `ID fotografie u úlovku ${catchId}`);
  requireString(photo.name, `název fotografie u úlovku ${catchId}`);
  requireString(photo.type, `typ fotografie u úlovku ${catchId}`);
  if (!ALLOWED_PHOTO_TYPES.has(photo.type)) fail(`Fotografie u úlovku ${catchId} má nepodporovaný typ.`);
  if (!Number.isSafeInteger(photo.blobSize) || photo.blobSize < 0 || photo.blobSize > MAX_PHOTO_BYTES) {
    fail(`Fotografie u úlovku ${catchId} překračuje povolenou velikost.`);
  }
  const bytes = decodeBase64(photo.dataBase64, photo.name);
  if (bytes.byteLength !== photo.blobSize) fail(`Velikost fotografie ${photo.name} neodpovídá údajům v záloze.`);
  const isJpeg = photo.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = photo.type === "image/png" && bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isWebp = photo.type === "image/webp" && bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) fail(`Obsah fotografie ${photo.name} neodpovídá deklarovanému typu.`);
  const metadata = { ...photo };
  delete metadata.dataBase64;
  delete metadata.blobSize;
  return { ...metadata, blob: new Blob([bytes], { type: photo.type }) };
}

function decodeCatch(record, tripIds) {
  if (!isRecord(record)) fail("Záloha obsahuje neplatný záznam úlovku.");
  requireString(record.id, "ID úlovku");
  if (record.schemaVersion !== 1) fail(`Úlovek ${record.id} používá nepodporovanou verzi dat.`);
  requireTimestamp(record.createdAt, `createdAt úlovku ${record.id}`);
  requireTimestamp(record.updatedAt, `updatedAt úlovku ${record.id}`);
  requireTimestamp(record.caughtAt, `caughtAt úlovku ${record.id}`);
  requireString(record.speciesKey, `druh úlovku ${record.id}`);
  requireString(record.species, `název druhu úlovku ${record.id}`);
  if (record.speciesLatin !== null && typeof record.speciesLatin !== "string") fail(`Úlovek ${record.id} obsahuje neplatný latinský název.`);
  for (const key of ["weightKg", "lengthCm", "girthCm", "fightMinutes", "waterNumber", "waterDepthM"]) {
    requireOptionalNumber(record[key], `${key} úlovku ${record.id}`);
  }
  for (const key of ["locationName", "gpsLocation", "notes", "result"]) {
    if (typeof record[key] !== "string") fail(`Záloha obsahuje neplatné pole ${key} úlovku ${record.id}.`);
  }
  if (record.tripId !== null && (typeof record.tripId !== "string" || !tripIds.has(record.tripId))) {
    fail(`Úlovek ${record.id} odkazuje na výpravu, která v záloze není.`);
  }
  if (record.bottomType !== null && typeof record.bottomType !== "string") fail(`Úlovek ${record.id} obsahuje neplatný typ dna.`);
  if (record.method !== null && (!isRecord(record.method) || typeof record.method.key !== "string" || typeof record.method.label !== "string")) {
    fail(`Úlovek ${record.id} obsahuje neplatnou metodu.`);
  }
  if (record.method && typeof record.method.isCustom !== "boolean") fail(`Úlovek ${record.id} obsahuje neplatnou metodu.`);
  if (!Array.isArray(record.baits) || record.baits.some((bait) => !isRecord(bait) || typeof bait.key !== "string" || typeof bait.label !== "string" || typeof bait.isCustom !== "boolean")) {
    fail(`Úlovek ${record.id} obsahuje neplatný seznam nástrah.`);
  }
  if (typeof record.isFavorite !== "boolean") fail(`Úlovek ${record.id} obsahuje neplatný stav oblíbených.`);
  if (!isRecord(record.sync) || !ALLOWED_SYNC_STATUSES.has(record.sync.status) || !Number.isSafeInteger(record.sync.revision) || record.sync.revision < 0) {
    fail(`Úlovek ${record.id} obsahuje neplatná synchronizační metadata.`);
  }
  if (!Array.isArray(record.photos) || record.photos.length > 1) fail(`Úlovek ${record.id} obsahuje nepodporovaný počet fotografií.`);
  const photos = record.photos.map((photo) => decodePhoto(photo, record.id));
  requireUniqueIds(photos, `fotografií u úlovku ${record.id}`);
  return {
    ...record,
    ownerId: null,
    photos: photos.map((photo) => ({ ...photo, photoStatus: "local-only" })),
    sync: { status: "local", revision: Math.max(1, record.sync.revision), photoStatus: photos.length ? "local-only" : "none" },
  };
}

function decodeTrip(record) {
  if (!isRecord(record)) fail("Záloha obsahuje neplatný záznam výpravy.");
  requireString(record.id, "ID výpravy");
  if (record.schemaVersion !== 1) fail(`Výprava ${record.id} používá nepodporovanou verzi dat.`);
  requireTimestamp(record.createdAt, `createdAt výpravy ${record.id}`);
  requireTimestamp(record.updatedAt, `updatedAt výpravy ${record.id}`);
  requireTimestamp(record.startedAt, `startedAt výpravy ${record.id}`);
  requireTimestamp(record.endedAt, `endedAt výpravy ${record.id}`, true);
  requireString(record.title, `název výpravy ${record.id}`);
  if (typeof record.locationName !== "string") fail(`Výprava ${record.id} obsahuje neplatnou lokalitu.`);
  if (record.methodKey !== null && typeof record.methodKey !== "string") fail(`Výprava ${record.id} obsahuje neplatnou metodu.`);
  if (!isRecord(record.sync) || !ALLOWED_SYNC_STATUSES.has(record.sync.status) || !Number.isSafeInteger(record.sync.revision) || record.sync.revision < 0) {
    fail(`Výprava ${record.id} obsahuje neplatná synchronizační metadata.`);
  }
  if (record.endedAt && Date.parse(record.endedAt) < Date.parse(record.startedAt)) fail(`Výprava ${record.id} končí před svým začátkem.`);
  return { ...record, ownerId: null, sync: { status: "local", revision: Math.max(1, record.sync.revision) } };
}

function requireUniqueIds(records, label) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) fail(`Záloha obsahuje duplicitní ID ${label}: ${record.id}.`);
    ids.add(record.id);
  }
  return ids;
}

export function parseLocalBackupDocument(document) {
  if (!isRecord(document) || document.format !== LOCAL_BACKUP_FORMAT) fail("Soubor není záloha ChytnuCz.");
  if (document.formatVersion !== LOCAL_BACKUP_VERSION) fail(`Verze zálohy ${document.formatVersion ?? "neznámá"} není podporována.`);
  requireTimestamp(document.createdAt, "createdAt zálohy");
  if (!isRecord(document.records) || !Array.isArray(document.records.catches) || !Array.isArray(document.records.trips)) {
    fail("Záloha neobsahuje úplný seznam úlovků a výprav.");
  }
  const tripIds = requireUniqueIds(document.records.trips, "výprav");
  const trips = document.records.trips.map(decodeTrip);
  const catches = document.records.catches.map((record) => decodeCatch(record, tripIds));
  requireUniqueIds(catches, "úlovků");
  if (trips.filter((trip) => !trip.endedAt).length > 1) fail("Záloha obsahuje více než jednu aktivní výpravu.");
  return { format: document.format, formatVersion: document.formatVersion, createdAt: document.createdAt, catches, trips };
}

export function parseLocalBackupJson(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    fail("Soubor není platný JSON.");
  }
  return parseLocalBackupDocument(document);
}

async function stableValue(value) {
  if (value instanceof Blob) return { $blob: value.type, size: value.size, bytes: Array.from(new Uint8Array(await value.arrayBuffer())) };
  if (Array.isArray(value)) return Promise.all(value.map(stableValue));
  if (isRecord(value)) {
    return Object.fromEntries(await Promise.all(Object.keys(value).sort().map(async (key) => [key, await stableValue(value[key])] )));
  }
  return value;
}

export async function recordsAreEqual(left, right) {
  const [stableLeft, stableRight] = await Promise.all([stableValue(left), stableValue(right)]);
  return JSON.stringify(stableLeft) === JSON.stringify(stableRight);
}

function recordsMatchWithinTransaction(left, right) {
  function comparable(value) {
    if (value instanceof Blob) return { $blob: value.type, size: value.size };
    if (Array.isArray(value)) return value.map(comparable);
    if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, comparable(value[key])]));
    return value;
  }
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export async function summarizeLocalBackupRestore(backup, current) {
  const currentCatches = new Map(current.catches.map((record) => [record.id, record]));
  const currentTrips = new Map(current.trips.map((record) => [record.id, record]));
  let unchanged = 0;
  let conflicts = 0;
  for (const [incoming, existing] of [
    ...backup.catches.map((record) => [record, currentCatches.get(record.id)]),
    ...backup.trips.map((record) => [record, currentTrips.get(record.id)]),
  ]) {
    if (!existing) continue;
    if (await recordsAreEqual(incoming, existing)) unchanged += 1;
    else conflicts += 1;
  }
  return {
    catchCount: backup.catches.length,
    tripCount: backup.trips.length,
    photoCount: backup.catches.reduce((count, record) => count + record.photos.length, 0),
    duplicateCount: unchanged + conflicts,
    unchangedCount: unchanged,
    conflictCount: conflicts,
  };
}

function readAll(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Místní záznamy se nepodařilo načíst."));
  });
}

export async function restoreLocalBackup(backup, mode, openDatabase = openLocalDatabase) {
  if (mode !== "merge" && mode !== "replace") fail("Vyber způsob obnovení zálohy.");
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction;
    let settled = false;
    let failure;
    let importedCatchCount = backup.catches.length;
    let importedTripCount = backup.trips.length;
    let skippedCount = 0;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      db.close();
      reject(error);
    };
    try {
      transaction = db.transaction(STORES, "readwrite");
      const catchStore = transaction.objectStore("catches");
      const tripStore = transaction.objectStore("trips");
      Promise.all([readAll(catchStore), readAll(tripStore)]).then(([existingCatches, existingTrips]) => {
        if (settled) return;
        try {
          let catchesToWrite = backup.catches;
          let tripsToWrite = backup.trips;
          let catchesToDelete = [];
          let tripsToDelete = [];
          const catchMap = new Map(existingCatches.map((record) => [record.id, record]));
          const tripMap = new Map(existingTrips.map((record) => [record.id, record]));
          if (mode === "merge") {
            const conflicts = [];
            catchesToWrite = [];
            tripsToWrite = [];
            for (const record of backup.catches) {
              const existing = catchMap.get(record.id);
              if (!existing) catchesToWrite.push(record);
              else if (!recordsMatchWithinTransaction(record, existing)) conflicts.push(`úlovek ${record.id}`);
              else skippedCount += 1;
            }
            for (const record of backup.trips) {
              const existing = tripMap.get(record.id);
              if (!existing) tripsToWrite.push(record);
              else if (!recordsMatchWithinTransaction(record, existing)) conflicts.push(`výprava ${record.id}`);
              else skippedCount += 1;
            }
            if (conflicts.length) fail(`Sloučení zastaveno: stejná ID mají odlišný obsah (${conflicts.slice(0, 3).join(", ")}${conflicts.length > 3 ? "…" : ""}). Zvol nahrazení jen tehdy, pokud chceš celý místní deník nahradit zálohou.`);
            const finalTrips = [...existingTrips, ...tripsToWrite];
            if (finalTrips.filter((trip) => !trip.endedAt).length > 1) fail("Sloučení by vytvořilo více aktivních výprav. Místní data zůstala beze změny.");
            importedCatchCount = catchesToWrite.length;
            importedTripCount = tripsToWrite.length;
          } else {
            const backupCatchIds = new Set(backup.catches.map((record) => record.id));
            const backupTripIds = new Set(backup.trips.map((record) => record.id));
            catchesToDelete = existingCatches.filter((record) => !backupCatchIds.has(record.id));
            tripsToDelete = existingTrips.filter((record) => !backupTripIds.has(record.id));
            catchesToWrite = backup.catches.filter((record) => {
              const existing = catchMap.get(record.id);
              if (existing && recordsMatchWithinTransaction(record, existing)) {
                skippedCount += 1;
                return false;
              }
              return true;
            });
            tripsToWrite = backup.trips.filter((record) => {
              const existing = tripMap.get(record.id);
              if (existing && recordsMatchWithinTransaction(record, existing)) {
                skippedCount += 1;
                return false;
              }
              return true;
            });
          }
          // A local backup restore must never delete cloud data as a side
          // effect. Replaced rows and their old pending operations are removed
          // locally; imported rows are deliberately ownerless until the user
          // explicitly links them to an account.
          const outboxStore = transaction.objectStore(OUTBOX_STORE_NAME);
          const removePendingFor = (entityType, entityId) => {
            const request = outboxStore.getAll();
            request.onsuccess = () => request.result
              .filter((operation) => operation.entityType === entityType && operation.entityId === entityId)
              .forEach((operation) => outboxStore.delete(operation.sequence));
            request.onerror = () => transaction.abort();
          };
          catchesToDelete.forEach((record) => { removePendingFor("catch", record.id); catchStore.delete(record.id); });
          tripsToDelete.forEach((record) => { removePendingFor("trip", record.id); tripStore.delete(record.id); });
          tripsToWrite.forEach((record) => {
            removePendingFor("trip", record.id);
            queueOutboxOperation(transaction, {
              entityType: "trip", entityId: record.id, operation: "upsert",
              localRevision: record.sync?.revision ?? 1,
            }, (revision) => tripStore.put({ ...record, sync: { ...(record.sync ?? {}), status: "local", revision } }));
          });
          catchesToWrite.forEach((record) => {
            removePendingFor("catch", record.id);
            queueOutboxOperation(transaction, {
              entityType: "catch", entityId: record.id, operation: "upsert",
              localRevision: record.sync?.revision ?? 1,
            }, (revision) => catchStore.put({ ...record, sync: { ...(record.sync ?? {}), status: "local", revision } }));
          });
        } catch (error) {
          failure = error;
          try { transaction.abort(); } catch { rejectOnce(error); }
        }
      }).catch((error) => {
        failure = error;
        try { transaction.abort(); } catch { rejectOnce(error); }
      });
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        db.close();
        resolve({ catches: importedCatchCount, trips: importedTripCount, skipped: skippedCount, mode });
      };
      transaction.onerror = () => rejectOnce(failure ?? transaction.error ?? new Error("Zálohu se nepodařilo obnovit. Místní data zůstala zachována."));
      transaction.onabort = () => rejectOnce(failure ?? transaction.error ?? new Error("Obnova byla přerušena. Místní data zůstala zachována."));
    } catch (error) {
      rejectOnce(error);
    }
  });
}
