import { openLocalDatabase, APP_META_STORE_NAME, catchRepository } from "../../catches/data/catchRepository.js";
import { quickCaptureGenerationKey } from "../../catches/data/quickCaptureLifecycle.js";
import { createAdminClient } from "../../admin/adminClient.js";

const key = scope => JSON.stringify(["admin-adjustment-v1", scope.scopeKey]);
const valid = value => Number.isSafeInteger(value?.adjustmentXp) && Math.abs(value.adjustmentXp) <= 1000000 && Number.isSafeInteger(value?.revision) && value.revision >= 0;
export async function cachedAdminAdjustment(scope) {
  if (!scope.ownerId) return { adjustmentXp: 0, revision: 0 };
  const db = await openLocalDatabase();
  try {
    const tx = db.transaction(APP_META_STORE_NAME, "readonly");
    const value = await new Promise((resolve, reject) => { const request = tx.objectStore(APP_META_STORE_NAME).get(key(scope)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return value?.ownerId === scope.ownerId && value?.scopeKey === scope.scopeKey && valid(value) ? value : { adjustmentXp: 0, revision: 0 };
  } finally { db.close(); }
}
export async function loadAdminAdjustment(scope, client = createAdminClient({ ownerId: scope.ownerId })) {
  const cached = await cachedAdminAdjustment(scope).catch(() => ({ adjustmentXp: 0, revision: 0 }));
  if (!scope.ownerId) return cached;
  try {
    const generation = await catchRepository.getQuickCaptureGeneration(scope);
    const value = await client.request("progression.self");
    if (!valid(value) || value.revision < cached.revision) return cached;
    const db = await openLocalDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(APP_META_STORE_NAME, "readwrite");
      const store = tx.objectStore(APP_META_STORE_NAME), request = store.get(quickCaptureGenerationKey(scope.scopeKey));
      request.onsuccess = () => {
        if ((request.result?.generation ?? null) !== generation) return;
        store.put({ key: key(scope), kind: "adminProgressionAdjustment", ownerId: scope.ownerId, scopeKey: scope.scopeKey, adjustmentXp: value.adjustmentXp, revision: value.revision });
      };
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
    });
    return value;
  } catch { return cached; }
}
