import manifest from "./risManifest.json" with { type: "json" };
import { openLocalDatabase, APP_META_STORE_NAME } from "../../catches/data/catchRepository.js";
import { validCatalogueId } from "./risCatalogueModel.js";
export { manifest as RIS_MANIFEST };

const cache = {
  async read(key) {
    const db = await openLocalDatabase();
    try { return await new Promise((resolve,reject) => { const request = db.transaction(APP_META_STORE_NAME,"readonly").objectStore(APP_META_STORE_NAME).get(key); request.onsuccess = () => resolve(request.result?.value); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  },
  async write(key,value) {
    const db = await openLocalDatabase();
    try { await new Promise((resolve,reject) => { const tx = db.transaction(APP_META_STORE_NAME,"readwrite"); tx.objectStore(APP_META_STORE_NAME).put({ key, kind:"publicWaterCatalogue", value }); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); }); }
    finally { db.close(); }
  },
};
export function createRisCatalogue({ fetchImpl = globalThis.fetch, storage = cache, metadata = manifest } = {}) {
  const pending = new Map();
  async function load(file, valid) {
    if (pending.has(file)) return pending.get(file);
    const request = (async () => {
      const key = `public-ris:${metadata.version}:${file}`;
      const stored = await storage.read(key).catch(() => null);
      if (valid(stored)) return stored;
      let response;
      try { response = await fetchImpl(`/data/ris/${metadata.version}/${file}`, { credentials:"omit", signal:AbortSignal.timeout(20000) }); }
      catch { throw new Error("Tato část katalogu ještě není uložená v zařízení. Připoj se k internetu a zkus to znovu."); }
      if (!response.ok) throw new Error("Katalog se nepodařilo načíst. Připoj se k internetu a zkus to znovu.");
      const value = await response.json();
      if (!valid(value)) throw new Error("Katalog nemá platný formát.");
      await storage.write(key,value).catch(() => {});
      return value;
    })();
    pending.set(file,request);
    try { return await request; } catch (error) { pending.delete(file); throw error; }
  }
  return {
    list: () => load("index.json", rows => Array.isArray(rows) && rows.length === metadata.count && rows.every(row => validCatalogueId(row.id) && typeof row.name === "string" && typeof row.number === "string")),
    async get(id) {
      if (!validCatalogueId(id)) return null;
      const [rows,index] = await Promise.all([
        load(`details-${id[4]}.json`, value => value && typeof value === "object" && !Array.isArray(value) && Object.entries(value).every(([key,row]) => validCatalogueId(key) && row.id === key && typeof row.detail?.pageText === "string")),
        load("index.json", value => Array.isArray(value) && value.length === metadata.count),
      ]);
      const row = rows[id];
      if (!row) return null;
      return { ...row, numberUnique: index.find(item => item.id === id)?.numberUnique === true };
    },
  };
}
export const risCatalogue = createRisCatalogue();
