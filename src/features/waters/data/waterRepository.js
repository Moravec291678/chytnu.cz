import {
  accountScopeKey,
  isAccountScope,
  isGuestScope,
  recordScopeKey,
} from "../../auth/data/localDataScope.js";
import {
  openLocalDatabase,
  queueOutboxOperation,
  WATER_STORE_NAME,
  WATER_CHAT_STORE_NAME,
  OUTBOX_STORE_NAME,
} from "../../catches/data/catchRepository.js";

export const WATER_CHAT_MAX_LENGTH = 500;
let legacyMigration;

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function scopeOf(scope = {}) {
  return scope?.scopeKey || (scope?.ownerId ? accountScopeKey(scope.ownerId) : "guest");
}

function syncable(scopeKey) {
  return isAccountScope(scopeKey) || isGuestScope(scopeKey);
}

function normalizeStoredMessage(record) {
  if (!record) return null;
  return {
    id: record.id,
    waterId: record.waterId,
    scopeKey: record.scopeKey,
    author: String(record.author || record.authorName || "Místní profil").trim(),
    text: String(record.text || ""),
    createdAt: record.createdAt || record.timestamp || null,
  };
}

function openLegacyDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return resolve(null);
    const request = indexedDB.open("chytnu-waters", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("waters")) db.createObjectStore("waters", { keyPath: "id" });
      if (!db.objectStoreNames.contains("waterChat")) db.createObjectStore("waterChat", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function migrateLegacyData() {
  if (legacyMigration) return legacyMigration;
  legacyMigration = (async () => {
    const legacy = await openLegacyDatabase();
    if (!legacy) return;
    try {
      const tx = legacy.transaction(["waters", "waterChat"], "readonly");
      const waters = await requestPromise(tx.objectStore("waters").getAll());
      const messages = await requestPromise(tx.objectStore("waterChat").getAll());
      if (!waters.length && !messages.length) return;
      const db = await openLocalDatabase();
      try {
        const mainTx = db.transaction([WATER_STORE_NAME, WATER_CHAT_STORE_NAME], "readwrite");
        const waterStore = mainTx.objectStore(WATER_STORE_NAME);
        const chatStore = mainTx.objectStore(WATER_CHAT_STORE_NAME);
        waters.forEach((water) => {
          const request = waterStore.get(water.id);
          request.onsuccess = () => { if (!request.result) waterStore.put(water); };
        });
        messages.forEach((message) => {
          const request = chatStore.get(message.id);
          request.onsuccess = () => { if (!request.result) chatStore.put(message); };
        });
        await new Promise((resolve, reject) => {
          mainTx.oncomplete = resolve;
          mainTx.onerror = () => reject(mainTx.error);
          mainTx.onabort = () => reject(mainTx.error);
        });
      } finally { db.close(); }
    } finally { legacy.close(); }
  })().catch(() => undefined);
  return legacyMigration;
}

async function readScopedWater(id, scopeKey) {
  const db = await openLocalDatabase();
  try {
    const record = await requestPromise(db.transaction(WATER_STORE_NAME, "readonly").objectStore(WATER_STORE_NAME).get(id));
    return record && (record.scopeKey || recordScopeKey(record)) === scopeKey ? record : null;
  } finally { db.close(); }
}

export const waterRepository = {
  async list(scope = {}) {
    await migrateLegacyData();
    const db = await openLocalDatabase();
    try {
      const records = await requestPromise(db.transaction(WATER_STORE_NAME, "readonly").objectStore(WATER_STORE_NAME).index("scopeKey").getAll(scopeOf(scope)));
      return (records || []).filter((record) => !record.deleted && (record.scopeKey || recordScopeKey(record)) === scopeOf(scope)).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    } finally { db.close(); }
  },

  get: async (id, scope = {}) => { await migrateLegacyData(); return readScopedWater(id, scopeOf(scope)); },

  async put(water, scope = {}) {
    await migrateLegacyData();
    const scopeKey = scopeOf(scope);
    const ownerId = scope?.ownerId || water.ownerId || null;
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const stores = syncable(scopeKey) ? [WATER_STORE_NAME, OUTBOX_STORE_NAME] : [WATER_STORE_NAME];
      const transaction = db.transaction(stores, "readwrite");
      const store = transaction.objectStore(WATER_STORE_NAME);
      const lookup = store.get(water.id);
      let result;
      let failure = null;
      lookup.onsuccess = () => {
        const existing = lookup.result;
        if (existing && (existing.scopeKey || recordScopeKey(existing)) !== scopeKey) {
          failure = new Error("Revír nepatří do aktivního profilu."); transaction.abort(); return;
        }
        result = { ...water, scopeKey, ownerId, updatedAt: new Date().toISOString(), deleted: false };
        const revision = (existing?.sync?.revision || 0) + 1;
        result.sync = { ...(existing?.sync || {}), revision, status: "pending", photoStatus: "none" };
        if (syncable(scopeKey)) {
          queueOutboxOperation(transaction, { entityType: "water", entityId: result.id, operation: "upsert", localRevision: revision, ownerId, scopeKey, baseServerRevision: existing?.sync?.serverRevision ?? null });
        }
        store.put(result);
      };
      lookup.onerror = () => { failure = lookup.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(failure || transaction.error || new Error("Revír se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(failure || transaction.error || new Error("Uložení revíru bylo přerušeno.")); };
    });
  },

  async delete(id, scope = {}) {
    await migrateLegacyData();
    const scopeKey = scopeOf(scope);
    const existing = await readScopedWater(id, scopeKey);
    if (!existing) return null;
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const stores = syncable(scopeKey) ? [WATER_STORE_NAME, OUTBOX_STORE_NAME] : [WATER_STORE_NAME];
      const transaction = db.transaction(stores, "readwrite");
      const store = transaction.objectStore(WATER_STORE_NAME);
      if (syncable(scopeKey)) {
        queueOutboxOperation(transaction, { entityType: "water", entityId: id, operation: "delete", localRevision: (existing.sync?.revision || 0) + 1, ownerId: existing.ownerId || scope.ownerId || null, scopeKey, baseServerRevision: existing.sync?.serverRevision ?? null }, () => store.delete(id));
      } else store.delete(id);
      transaction.oncomplete = () => { db.close(); resolve(id); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Revír se nepodařilo smazat.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Mazání revíru bylo přerušeno.")); };
    });
  },

  async listMessages(waterId, scope = {}) {
    await migrateLegacyData();
    const db = await openLocalDatabase();
    try {
      const messages = await requestPromise(db.transaction(WATER_CHAT_STORE_NAME, "readonly").objectStore(WATER_CHAT_STORE_NAME).index("waterId").getAll(waterId));
      return (messages || []).filter((message) => message.scopeKey === scopeOf(scope)).map(normalizeStoredMessage).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    } finally { db.close(); }
  },

  async addMessage({ waterId, text, author = "Místní profil", scope = {} }) {
    await migrateLegacyData();
    const trimmed = (text || "").trim();
    if (!waterId) throw new Error("Zpráva musí patřit ke konkrétnímu revíru.");
    if (!trimmed) throw new Error("Zpráva nesmí být prázdná.");
    if (trimmed.length > WATER_CHAT_MAX_LENGTH) throw new Error(`Zpráva může mít maximálně ${WATER_CHAT_MAX_LENGTH} znaků.`);
    const scopeKey = scopeOf(scope);
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([WATER_STORE_NAME, WATER_CHAT_STORE_NAME], "readwrite");
      const waterStore = transaction.objectStore(WATER_STORE_NAME);
      const chatStore = transaction.objectStore(WATER_CHAT_STORE_NAME);
      let message; let failure;
      const lookup = waterStore.get(waterId);
      lookup.onsuccess = () => {
        const water = lookup.result;
        if (!water || (water.scopeKey || recordScopeKey(water)) !== scopeKey) { failure = new Error("Revír není v aktivním profilu dostupný."); transaction.abort(); return; }
        message = { id: crypto.randomUUID(), waterId, scopeKey, author: String(author || "").trim() || "Místní profil", text: trimmed, createdAt: new Date().toISOString() };
        chatStore.add(message);
      };
      lookup.onerror = () => { failure = lookup.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(message); };
      transaction.onerror = () => { db.close(); reject(failure || transaction.error || new Error("Zprávu se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(failure || transaction.error || new Error("Uložení zprávy bylo přerušeno.")); };
    });
  },
};
