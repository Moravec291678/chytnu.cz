import { validateDataScope } from "../../auth/data/localDataScope.js";

const DATABASE_NAME = "chytnu-community-local";
const DATABASE_VERSION = 1;
const COMMENT_STORE = "comments";
const REACTION_STORE = "reactions";
const REPORT_STORE = "reports";

export const COMMUNITY_COMMENT_MAX_LENGTH = 500;
export const COMMUNITY_REACTION_TYPES = Object.freeze(["like", "wow", "trophy"]);
export const COMMUNITY_REPORT_REASONS = Object.freeze([
  { id: "suspicious-catch", label: "Podezřelý úlovek" },
  { id: "spam", label: "Spam" },
  { id: "inappropriate-content", label: "Nevhodný obsah" },
]);

function openCommunityDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Místní úložiště komunitních interakcí není dostupné."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of [COMMENT_STORE, REACTION_STORE, REPORT_STORE]) {
        if (db.objectStoreNames.contains(storeName)) continue;
        const store = db.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("catchId", "catchId", { unique: false });
        store.createIndex("scopeKey", "scopeKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Komunitní úložiště se nepodařilo otevřít."));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeEntityId(value, label) {
  const id = String(value || "").trim();
  if (!id) throw new Error(`${label} nemá platné ID.`);
  return id;
}

function displayAuthor(value) {
  const author = String(value || "").trim();
  return author.slice(0, 80) || "Místní profil";
}

function ownInteractionId(scopeKey, catchId) {
  return JSON.stringify([scopeKey, catchId]);
}

async function listForCatch(storeName, catchId, scope) {
  const validatedScope = validateDataScope(scope ?? {});
  const normalizedCatchId = normalizeEntityId(catchId, "Úlovek");
  const db = await openCommunityDatabase();
  try {
    const transaction = db.transaction(storeName, "readonly");
    const records = await requestValue(transaction.objectStore(storeName).index("catchId").getAll(normalizedCatchId));
    return records.filter((record) => record.scopeKey === validatedScope.scopeKey);
  } finally {
    db.close();
  }
}

export const communityInteractionRepository = {
  async listComments(catchId, scope) {
    const comments = await listForCatch(COMMENT_STORE, catchId, scope);
    return comments.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  },

  async createComment({ catchId, text, author, scope }) {
    const validatedScope = validateDataScope(scope ?? {});
    const normalizedCatchId = normalizeEntityId(catchId, "Úlovek");
    const normalizedText = String(text || "").trim();
    if (!normalizedText) throw new Error("Komentář nesmí být prázdný.");
    if (normalizedText.length > COMMUNITY_COMMENT_MAX_LENGTH) {
      throw new Error(`Komentář může mít maximálně ${COMMUNITY_COMMENT_MAX_LENGTH} znaků.`);
    }
    const comment = {
      id: crypto.randomUUID(),
      catchId: normalizedCatchId,
      scopeKey: validatedScope.scopeKey,
      authorKey: validatedScope.scopeKey,
      author: displayAuthor(author),
      text: normalizedText,
      createdAt: new Date().toISOString(),
    };
    const db = await openCommunityDatabase();
    try {
      const transaction = db.transaction(COMMENT_STORE, "readwrite");
      await requestValue(transaction.objectStore(COMMENT_STORE).add(comment));
      return comment;
    } finally {
      db.close();
    }
  },

  async deleteOwnComment(commentId, scope) {
    const validatedScope = validateDataScope(scope ?? {});
    const normalizedCommentId = normalizeEntityId(commentId, "Komentář");
    const db = await openCommunityDatabase();
    try {
      const transaction = db.transaction(COMMENT_STORE, "readwrite");
      const store = transaction.objectStore(COMMENT_STORE);
      const comment = await requestValue(store.get(normalizedCommentId));
      if (!comment || comment.scopeKey !== validatedScope.scopeKey || comment.authorKey !== validatedScope.scopeKey) {
        throw new Error("Smazat lze pouze vlastní komentář v aktivním profilu.");
      }
      await requestValue(store.delete(normalizedCommentId));
      return true;
    } finally {
      db.close();
    }
  },

  async getOwnReaction(catchId, scope) {
    const validatedScope = validateDataScope(scope ?? {});
    const normalizedCatchId = normalizeEntityId(catchId, "Úlovek");
    const db = await openCommunityDatabase();
    try {
      const transaction = db.transaction(REACTION_STORE, "readonly");
      return await requestValue(transaction.objectStore(REACTION_STORE).get(ownInteractionId(validatedScope.scopeKey, normalizedCatchId))) ?? null;
    } finally {
      db.close();
    }
  },

  async setOwnReaction({ catchId, type, scope }) {
    const validatedScope = validateDataScope(scope ?? {});
    const normalizedCatchId = normalizeEntityId(catchId, "Úlovek");
    if (type !== null && !COMMUNITY_REACTION_TYPES.includes(type)) throw new Error("Neplatný typ reakce.");
    const id = ownInteractionId(validatedScope.scopeKey, normalizedCatchId);
    const db = await openCommunityDatabase();
    try {
      const transaction = db.transaction(REACTION_STORE, "readwrite");
      const store = transaction.objectStore(REACTION_STORE);
      if (type === null) {
        await requestValue(store.delete(id));
        return null;
      }
      const existing = await requestValue(store.get(id));
      const now = new Date().toISOString();
      const reaction = {
        id,
        catchId: normalizedCatchId,
        scopeKey: validatedScope.scopeKey,
        authorKey: validatedScope.scopeKey,
        type,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await requestValue(store.put(reaction));
      return reaction;
    } finally {
      db.close();
    }
  },

  async createReport({ catchId, reason, scope }) {
    const validatedScope = validateDataScope(scope ?? {});
    const normalizedCatchId = normalizeEntityId(catchId, "Úlovek");
    if (!COMMUNITY_REPORT_REASONS.some((item) => item.id === reason)) throw new Error("Vyber platný důvod hlášení.");
    const id = ownInteractionId(validatedScope.scopeKey, normalizedCatchId);
    const db = await openCommunityDatabase();
    try {
      const transaction = db.transaction(REPORT_STORE, "readwrite");
      const store = transaction.objectStore(REPORT_STORE);
      const existing = await requestValue(store.get(id));
      const now = new Date().toISOString();
      const report = {
        id,
        catchId: normalizedCatchId,
        scopeKey: validatedScope.scopeKey,
        reporterKey: validatedScope.scopeKey,
        reason,
        status: "local-pending",
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await requestValue(store.put(report));
      return report;
    } finally {
      db.close();
    }
  },

  async getOwnReport(catchId, scope) {
    const reports = await listForCatch(REPORT_STORE, catchId, scope);
    return reports[0] ?? null;
  },
};
