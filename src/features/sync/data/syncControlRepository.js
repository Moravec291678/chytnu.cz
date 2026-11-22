import { openLocalDatabase, SYNC_STATE_STORE_NAME } from "../../catches/data/catchRepository.js";

const LEASE_MS = 5 * 60_000;

async function updateState(ownerId, mutate) {
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STATE_STORE_NAME, "readwrite");
    const store = tx.objectStore(SYNC_STATE_STORE_NAME);
    let result;
    const request = store.get(ownerId);
    request.onsuccess = () => {
      const row = request.result ?? { ownerId };
      result = mutate(row);
      if (result) store.put(result);
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Stav synchronizace nelze uložit.")); };
  });
}

export async function writeSyncControl(ownerId, control) {
  await updateState(ownerId, row => ({ ...row, control }));
}

export async function withAccountSyncLock(ownerId, run, { locks = globalThis.navigator?.locks, now = Date.now } = {}) {
  if (locks?.request) return locks.request(`chytnu-sync:${ownerId}`, run);
  const id = crypto.randomUUID();
  const claim = await updateState(ownerId, row => row.syncLease?.expiresAt > now()
    ? null : { ...row, syncLease: { id, expiresAt: now() + LEASE_MS } });
  if (!claim) return false;

  const timer = setInterval(() => {
    void updateState(ownerId, row => row.syncLease?.id === id
      ? { ...row, syncLease: { id, expiresAt: now() + LEASE_MS } } : null).catch(() => {});
  }, LEASE_MS / 5);
  try { await run(); }
  finally {
    clearInterval(timer);
    await updateState(ownerId, row => row.syncLease?.id === id ? { ...row, syncLease: null } : null);
  }
  return true;
}
