export const LOCAL_BACKUP_FORMAT = "chytnucz-local-backup";
export const LOCAL_BACKUP_VERSION = 1;

const BASE64_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBytesToBase64(bytes) {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    const triplet = (first << 16) | (second << 8) | third;

    encoded += BASE64_CHARACTERS[(triplet >> 18) & 63];
    encoded += BASE64_CHARACTERS[(triplet >> 12) & 63];
    encoded += hasSecond ? BASE64_CHARACTERS[(triplet >> 6) & 63] : "=";
    encoded += hasThird ? BASE64_CHARACTERS[triplet & 63] : "=";
  }
  return encoded;
}

async function serializePhoto(photo, catchId) {
  if (!(photo?.blob instanceof Blob)) {
    throw new Error(`Fotografii u úlovku ${catchId} nelze bezpečně zahrnout do zálohy.`);
  }

  const { blob, ...photoFields } = photo;
  return {
    ...photoFields,
    id: photo.id ?? null,
    name: photo.name ?? "fotografie",
    type: photo.type ?? photo.blob.type ?? "application/octet-stream",
    blobSize: blob.size,
    dataBase64: encodeBytesToBase64(new Uint8Array(await blob.arrayBuffer())),
  };
}

async function serializeCatch(record) {
  const { photos = [], ...fields } = record;
  return {
    ...fields,
    photos: await Promise.all(photos.map((photo) => serializePhoto(photo, record.id))),
  };
}

export async function createLocalBackupDocument({ catches, trips, privacySettings, progressionEvents, createdAt = new Date() }) {
  if (!Array.isArray(catches) || !Array.isArray(trips)) {
    throw new Error("Místní úlovky a vycházky se nepodařilo načíst jako úplné záznamy.");
  }

  const records = {
    catches: await Promise.all(catches.map(serializeCatch)),
    trips: trips.map((trip) => ({ ...trip })),
  };
  if (privacySettings !== undefined) records.privacySettings = privacySettings ? { ...privacySettings } : null;
  if (progressionEvents !== undefined) records.progressionEvents = progressionEvents.map((event) => ({ ...event }));
  return {
    format: LOCAL_BACKUP_FORMAT,
    formatVersion: LOCAL_BACKUP_VERSION,
    createdAt: createdAt.toISOString(),
    records,
  };
}

export async function serializeLocalBackupJson(snapshot) {
  return JSON.stringify(await createLocalBackupDocument(snapshot));
}

export function getLocalBackupFileName(date = new Date()) {
  return `chytnucz-zaloha-${date.toISOString().slice(0, 10)}.json`;
}
