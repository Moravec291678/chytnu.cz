import {
  connectStorageEmulator,
  deleteObject,
  getBytes,
  getMetadata,
  getStorage,
  listAll,
  ref,
  uploadBytes,
} from "firebase/storage";
import { firebaseAuth, getLocalFirebaseApp } from "../../auth/data/firebaseAuth.js";
import { getBackendConfiguration } from "../../auth/data/backendConfig.js";
import { SyncPortError } from "./syncPort.js";

const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 9199;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const GLOBAL_CONNECTIONS = Symbol.for("chytnucz.firebaseEmulatorConnections");

function sha256(bytes) {
  return globalThis.crypto.subtle.digest("SHA-256", bytes)
    .then((digest) => [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""));
}

function safeSegment(value, name) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new SyncPortError("invalid_request", `${name} fotografie má neplatný formát.`);
  }
  return value;
}

function objectPath(ownerId, catchId, photoId, hash) {
  return `users/${safeSegment(ownerId, "Vlastník")}/catches/${safeSegment(catchId, "Úlovek")}/photos/${safeSegment(photoId, "ID")}/${hash}`;
}

function verifyRemoteMetadata(photo) {
  if (!/^[a-f0-9]{64}$/.test(photo?.sha256 ?? "")) {
    throw new SyncPortError("invalid_request", "Fotografie nemá platný kontrolní součet.");
  }
  if (!Number.isSafeInteger(photo.size) || photo.size < 0 || photo.size > MAX_PHOTO_BYTES) {
    throw new SyncPortError("invalid_request", "Fotografie překračuje povolenou velikost.");
  }
  if (!ALLOWED_TYPES.has(photo.type)) {
    throw new SyncPortError("invalid_request", "Fotografie má nepodporovaný typ.");
  }
}

function normalizeStorageError(error, fallback) {
  if (error instanceof SyncPortError) return error;
  const code = String(error?.code ?? "");
  if (code.includes("unauthorized") || code.includes("unauthenticated")) {
    return new SyncPortError("permission_denied", "K soukromé fotografii nemá tento účet přístup.", { cause: error });
  }
  if (code.includes("object-not-found") || code.includes("retry-limit-exceeded") || code.includes("unknown")) {
    return new SyncPortError("unavailable", fallback, { cause: error });
  }
  return new SyncPortError("unknown", fallback, { cause: error });
}

async function verifyStoredObject(target, photo) {
  const [metadata, bytes] = await Promise.all([getMetadata(target), getBytes(target, MAX_PHOTO_BYTES)]);
  if (metadata.size !== photo.size || metadata.contentType !== photo.type
    || metadata.customMetadata?.sha256 !== photo.sha256
    || bytes.byteLength !== photo.size
    || await sha256(bytes) !== photo.sha256) {
    throw new SyncPortError("invalid_request", "Nahraná fotografie neprošla kontrolou integrity.");
  }
  return bytes;
}

function getConfiguredStorage() {
  const app = getLocalFirebaseApp();
  globalThis[GLOBAL_CONNECTIONS] ??= new Set();
  const storage = getStorage(app);
  const key = `storage:${app.name}`;
  if (getBackendConfiguration().mode === "emulator" && !globalThis[GLOBAL_CONNECTIONS].has(key)) {
    connectStorageEmulator(storage, EMULATOR_HOST, EMULATOR_PORT);
    globalThis[GLOBAL_CONNECTIONS].add(key);
  }
  return storage;
}

export function createFirebasePhotoStorage({ storage: suppliedStorage, getCurrentUserId } = {}) {
  const storage = suppliedStorage ?? getConfiguredStorage();
  const currentUserId = getCurrentUserId ?? (() => firebaseAuth.currentUserId());

  function requireOwner(ownerId) {
    if (!ownerId || currentUserId() !== ownerId) {
      throw new SyncPortError("permission_denied", "Účet se změnil. Přenos fotografie byl zastaven.");
    }
  }

  return Object.freeze({
    async describe({ ownerId, catchId, photo }) {
      requireOwner(ownerId);
      if (!(photo?.blob instanceof Blob)) {
        throw new SyncPortError("invalid_request", "Místní kopie fotografie chybí; synchronizace ji nepřepíše prázdným souborem.");
      }
      if (!ALLOWED_TYPES.has(photo.type ?? photo.blob.type) || photo.blob.size <= 0 || photo.blob.size > MAX_PHOTO_BYTES) {
        throw new SyncPortError("invalid_request", "Fotografie má nepodporovaný typ nebo velikost.");
      }
      const type = photo.type ?? photo.blob.type;
      if (photo.blob.type && photo.blob.type !== type) {
        throw new SyncPortError("invalid_request", "Typ fotografie neodpovídá uloženému souboru.");
      }
      const bytes = new Uint8Array(await photo.blob.arrayBuffer());
      const hash = await sha256(bytes);
      return {
        ...photo,
        type,
        size: bytes.byteLength,
        sha256: hash,
        storagePath: objectPath(ownerId, catchId, photo.id, hash),
      };
    },

    async upload({ ownerId, catchId, photo }) {
      requireOwner(ownerId);
      verifyRemoteMetadata(photo);
      const expectedPath = objectPath(ownerId, catchId, photo.id, photo.sha256);
      if (photo.storagePath !== expectedPath || !(photo.blob instanceof Blob)) {
        throw new SyncPortError("invalid_request", "Cesta nebo místní obsah fotografie neodpovídá ověřeným metadatům.");
      }
      const bytes = new Uint8Array(await photo.blob.arrayBuffer());
      if (bytes.byteLength !== photo.size || await sha256(bytes) !== photo.sha256) {
        throw new SyncPortError("invalid_request", "Kontrolní součet fotografie se změnil před nahráním.");
      }
      const target = ref(storage, expectedPath);
      let existingMatches = false;
      try {
        const existing = await getMetadata(target);
        existingMatches = existing.size === photo.size
          && existing.contentType === photo.type
          && existing.customMetadata?.sha256 === photo.sha256;
      } catch (error) {
        if (error?.code !== "storage/object-not-found") throw normalizeStorageError(error, "Nahrání fotografie se nezdařilo.");
      }
      if (!existingMatches) {
        try {
          await uploadBytes(target, photo.blob, {
            contentType: photo.type,
            customMetadata: { sha256: photo.sha256 },
          });
        } catch (error) {
          throw normalizeStorageError(error, "Nahrání fotografie se nezdařilo. Změna zůstala ve frontě k opakování.");
        }
      }
      try {
        await verifyStoredObject(target, photo);
      } catch (error) {
        throw normalizeStorageError(error, "Nahraná fotografie nebyla ověřena. Změna zůstala ve frontě.");
      }
    },

    async download({ ownerId, catchId, photo }) {
      requireOwner(ownerId);
      verifyRemoteMetadata(photo);
      const expectedPath = objectPath(ownerId, catchId, photo.id, photo.sha256);
      if (photo.storagePath !== expectedPath) {
        throw new SyncPortError("permission_denied", "Cesta vzdálené fotografie neodpovídá přihlášenému vlastníkovi.");
      }
      try {
        const target = ref(storage, expectedPath);
        const bytes = await verifyStoredObject(target, photo);
        return { ...photo, blob: new Blob([bytes], { type: photo.type }), photoStatus: "synced" };
      } catch (error) {
        throw normalizeStorageError(error, "Fotografii se nepodařilo stáhnout. Záznam zůstává lokálně zachován.");
      }
    },

    async deleteUnreferenced({ ownerId, catchId, keepPaths = [] }) {
      requireOwner(ownerId);
      const prefixPath = `users/${safeSegment(ownerId, "Vlastník")}/catches/${safeSegment(catchId, "Úlovek")}/photos`;
      const keep = new Set(keepPaths);
      const listRecursively = async (folder) => {
        const result = await listAll(folder);
        const nested = await Promise.all(result.prefixes.map(listRecursively));
        return [...result.items, ...nested.flat()];
      };
      try {
        const items = await listRecursively(ref(storage, prefixPath));
        await Promise.all(items
          .filter((item) => !keep.has(item.fullPath))
          .map((item) => deleteObject(item).catch((error) => {
            if (error?.code !== "storage/object-not-found") throw error;
          })));
      } catch (error) {
        throw normalizeStorageError(error, "Odstranění zastaralé fotografie se nezdařilo. Synchronizace zůstala ve frontě.");
      }
    },
  });
}
