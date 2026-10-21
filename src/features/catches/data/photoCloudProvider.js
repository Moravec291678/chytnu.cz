export const PHOTO_CLOUD_STATE = Object.freeze({
  LOCAL_ONLY: "localOnly",
  PENDING_UPLOAD: "pendingUpload",
  UPLOAD_FAILED: "uploadFailed",
  SYNCED: "synced",
  PENDING_DELETE: "pendingDelete",
});

export const nonePhotoCloudProvider = Object.freeze({
  id: "none",
  isAvailable: async () => false,
  async upload() { throw new Error("Cloud úložiště fotografií není nakonfigurované."); },
  async download() { return null; },
  async delete() { return { deleted: false }; },
  async getMetadata() { return null; },
});

let activeProvider = nonePhotoCloudProvider;

export function assertPhotoCloudProvider(provider) {
  if (!provider || typeof provider.id !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(provider.id)
    || typeof provider.isAvailable !== "function"
    || typeof provider.upload !== "function"
    || typeof provider.download !== "function"
    || typeof provider.delete !== "function"
    || typeof provider.getMetadata !== "function") {
    throw new TypeError("Photo cloud provider nemá platné rozhraní.");
  }
  return provider;
}

export function configurePhotoCloudProvider(provider) {
  activeProvider = assertPhotoCloudProvider(provider);
  return activeProvider;
}

export function getPhotoCloudProvider() {
  return activeProvider;
}

function keySegment(value, label) {
  if (typeof value !== "string" || !value || value.length > 160 || value === "." || value === ".."
    || value.includes("/") || value.includes("\\")) {
    throw new TypeError(`${label} nemá bezpečný formát pro object key.`);
  }
  // Keep the segment unchanged so the key exactly matches the Firestore rules' owner/catch/photo path.
  return value;
}

export function createPhotoObjectKey(ownerId, catchId, photoId) {
  return `users/${keySegment(ownerId, "ID účtu")}/catches/${keySegment(catchId, "ID úlovku")}/photos/${keySegment(photoId, "ID fotografie")}/original`;
}

export async function sha256Blob(blob) {
  if (!(blob instanceof Blob)) throw new TypeError("Pro hashování fotografie jsou potřeba lokální Blob bytes.");
  if (!globalThis.crypto?.subtle) throw new Error("Toto zařízení neumí bezpečně ověřit fotografii.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Default upload preparation preserves the original Blob byte-for-byte. */
export async function preparePhotoForCloud(photo, transformer = null) {
  if (!(photo?.blob instanceof Blob)) throw new TypeError("Lokální fotografie není dostupná pro nahrání.");
  const prepared = transformer ? await transformer(photo.blob, photo) : { original: photo.blob };
  if (!(prepared?.original instanceof Blob)) throw new TypeError("Příprava fotografie musí zachovat originální Blob.");
  return { ...prepared, original: photo.blob };
}
