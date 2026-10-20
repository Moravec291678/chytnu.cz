const DB_NAME = "chytnu-waters";
const DB_VERSION = 1;
const STORE_NAME = "waters";
const CHAT_STORE_NAME = "waterChat";

function openWatersDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Místní úložiště revírů není dostupné."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("scopeKey", "scopeKey", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
      if (!db.objectStoreNames.contains(CHAT_STORE_NAME)) {
        const chatStore = db.createObjectStore(CHAT_STORE_NAME, { keyPath: "id" });
        chatStore.createIndex("waterId", "waterId", { unique: false });
        chatStore.createIndex("scopeKey", "scopeKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Nepodařilo se otevřít databázi revírů."));
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const WATER_CHAT_MAX_LENGTH = 500;

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

export const waterRepository = {
  async list(scope = {}) {
    const db = await openWatersDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const scopeKey = scope?.scopeKey || "guest";
      const records = await requestPromise(store.index("scopeKey").getAll(scopeKey));
      return (records || []).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    } finally {
      db.close();
    }
  },

  async get(id, scope = {}) {
    const db = await openWatersDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const record = await requestPromise(store.get(id));
      if (!record) return null;
      const scopeKey = scope?.scopeKey || "guest";
      return record.scopeKey === scopeKey ? record : null;
    } finally {
      db.close();
    }
  },

  async put(water, scope = {}) {
    const db = await openWatersDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const scopeKey = scope?.scopeKey || "guest";
      let failure = null;
      let record;
      const lookup = store.get(water.id);
      lookup.onsuccess = () => {
        const existing = lookup.result;
        if (existing && existing.scopeKey !== scopeKey) {
          failure = new Error("Revír nepatří do aktivního profilu.");
          transaction.abort();
          return;
        }
        record = { ...water, scopeKey, ownerId: scope?.ownerId || null, updatedAt: new Date().toISOString() };
        store.put(record);
      };
      lookup.onerror = () => { failure = lookup.error; transaction.abort(); };
      transaction.oncomplete = () => { db.close(); resolve(record); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Revír se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Uložení revíru bylo přerušeno.")); };
    });
  },

  async delete(id) {
    const db = await openWatersDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      await requestPromise(store.delete(id));
    } finally {
      db.close();
    }
  },

  async listMessages(waterId, scope = {}) {
    const db = await openWatersDatabase();
    try {
      const transaction = db.transaction(CHAT_STORE_NAME, "readonly");
      const store = transaction.objectStore(CHAT_STORE_NAME);
      const messages = await requestPromise(store.index("waterId").getAll(waterId));
      const scopeKey = scope?.scopeKey || "guest";
      return (messages || [])
        .filter((message) => message.scopeKey === scopeKey)
        .map(normalizeStoredMessage)
        .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    } finally {
      db.close();
    }
  },

  async addMessage({ waterId, text, author = "Místní profil", scope = {} }) {
    if (!waterId || !String(waterId).trim()) throw new Error("Zpráva musí patřit ke konkrétnímu revíru.");
    const trimmed = (text || "").trim();
    if (!trimmed) throw new Error("Zpráva nesmí být prázdná.");
    if (trimmed.length > WATER_CHAT_MAX_LENGTH) throw new Error(`Zpráva může mít maximálně ${WATER_CHAT_MAX_LENGTH} znaků.`);
    const authorName = String(author || "").trim() || "Místní profil";
    const db = await openWatersDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME, CHAT_STORE_NAME], "readwrite");
      const waterStore = transaction.objectStore(STORE_NAME);
      const chatStore = transaction.objectStore(CHAT_STORE_NAME);
      const scopeKey = scope?.scopeKey || "guest";
      let message = null;
      let failure = null;
      const lookup = waterStore.get(waterId);

      lookup.onsuccess = () => {
        const water = lookup.result;
        if (!water || water.scopeKey !== scopeKey) {
          failure = new Error("Revír není v aktivním profilu dostupný.");
          transaction.abort();
          return;
        }
        message = {
          id: crypto.randomUUID(),
          waterId,
          scopeKey,
          author: authorName,
          text: trimmed,
          createdAt: new Date().toISOString(),
        };
        chatStore.add(message);
      };
      lookup.onerror = () => {
        failure = lookup.error;
        transaction.abort();
      };
      transaction.oncomplete = () => { db.close(); resolve(message); };
      transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Zprávu se nepodařilo uložit.")); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("Uložení zprávy bylo přerušeno.")); };
    });
  },
};
