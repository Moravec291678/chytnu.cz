let durabilityRequest;

/** Ask once per page to protect local photo bytes from browser storage eviction. */
export async function requestPhotoStoragePersistence(storage = globalThis.navigator?.storage) {
  if (!storage || typeof storage.persisted !== "function" || typeof storage.persist !== "function") return false;
  try {
    if (await storage.persisted()) return true;
    return (await storage.persist()) === true;
  } catch {
    return false;
  }
}

export function requestPhotoStorageDurability() {
  durabilityRequest ??= requestPhotoStoragePersistence();
  return durabilityRequest;
}
