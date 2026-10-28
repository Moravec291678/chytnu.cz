import { validateDataScope } from "../../auth/data/localDataScope.js";
import { NOTIFICATION_STORE_NAME, openLocalDatabase } from "../../catches/data/catchRepository.js";
import { createNotificationRecord, mergeNotificationReadState, sortNotificationsNewestFirst } from "./notificationModel.js";
import { notificationFirestore } from "./notificationFirestore.js";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Oznámení se nepodařilo načíst."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Změnu oznámení se nepodařilo uložit."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Zápis oznámení byl přerušen."));
  });
}

async function withNotificationStore(openDatabase, mode, operation) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(NOTIFICATION_STORE_NAME, mode);
    const done = transactionDone(transaction);
    const result = await operation(transaction.objectStore(NOTIFICATION_STORE_NAME));
    await done;
    return result;
  } finally {
    db.close();
  }
}

function requireOwnedRecord(record, id, scope) {
  if (!record || record.id !== id || record.scopeKey !== scope.scopeKey || record.ownerId !== scope.ownerId) {
    throw new Error("Oznámení nepatří aktivnímu profilu.");
  }
  return record;
}

function serializeForFirestore(record) {
  const { id, ownerId, type, title, body, createdAt, readAt, deepLink } = record;
  return { id, ownerId, type, title, body, createdAt, readAt, deepLink };
}

export function createNotificationRepository({ openDatabase = openLocalDatabase, remote = notificationFirestore } = {}) {
  const localList = (scope) => withNotificationStore(openDatabase, "readonly", async (store) => (
    await requestResult(store.index("scopeKey").getAll(scope.scopeKey))
  ));

  const localPut = (record) => withNotificationStore(openDatabase, "readwrite", async (store) => {
    await requestResult(store.put(record));
    return record;
  });

  const localGet = (id) => withNotificationStore(openDatabase, "readonly", async (store) => requestResult(store.get(id)));

  async function syncReadState(ownerId, remoteRecord, localRecord, merged) {
    if (!merged.readAt || remoteRecord.readAt) return "synced";
    try {
      await remote.markRead(ownerId, merged.id, merged.readAt);
      return "synced";
    } catch {
      return "pending";
    }
  }

  async function syncWithOwner(scope, currentLocal) {
    if (!scope.ownerId || !remote) return currentLocal;
    let remoteRecords;
    try {
      remoteRecords = await remote.list(scope.ownerId);
    } catch {
      return currentLocal;
    }

    const remoteById = new Map(remoteRecords.filter((record) => record?.ownerId === scope.ownerId).map((record) => [record.id, record]));
    const localById = new Map(currentLocal.map((record) => [record.id, record]));
    for (const remoteRecord of remoteById.values()) {
      let merged;
      try {
        const normalizedRemote = createNotificationRecord(remoteRecord, scope);
        merged = {
          ...mergeNotificationReadState(localById.get(normalizedRemote.id), normalizedRemote),
          remoteSyncStatus: "synced",
        };
      } catch {
        continue;
      }
      if (merged.readAt && !remoteRecord.readAt) {
        merged.remoteSyncStatus = await syncReadState(scope.ownerId, remoteRecord, localById.get(merged.id), merged);
      }
      localById.set(merged.id, merged);
      await localPut(merged);
    }

    for (const localRecord of localById.values()) {
      if (remoteById.has(localRecord.id) || localRecord.remoteSyncStatus === "local-only") continue;
      try {
        await remote.create(serializeForFirestore(localRecord));
        await localPut({ ...localRecord, remoteSyncStatus: "synced" });
      } catch {
        try {
          const existingRemote = await remote.get(scope.ownerId, localRecord.id);
          if (!existingRemote) continue;
          const merged = { ...mergeNotificationReadState(localRecord, createNotificationRecord(existingRemote, scope)), remoteSyncStatus: "synced" };
          if (merged.readAt && !existingRemote.readAt) {
            merged.remoteSyncStatus = await syncReadState(scope.ownerId, existingRemote, localRecord, merged);
          }
          localById.set(merged.id, merged);
          await localPut(merged);
        } catch { /* Keep the owner-scoped notification in local storage for a later retry. */ }
      }
    }
    return [...localById.values()];
  }

  return Object.freeze({
    async create(input, scopeOptions) {
      const scope = validateDataScope(scopeOptions ?? {});
      const normalized = createNotificationRecord(input, scope);
      const record = await withNotificationStore(openDatabase, "readwrite", async (store) => {
        const existing = await requestResult(store.get(normalized.id));
        if (existing) return requireOwnedRecord(existing, normalized.id, scope);
        const created = { ...normalized, remoteSyncStatus: scope.ownerId && remote ? "pending" : "local-only" };
        await requestResult(store.add(created));
        return created;
      });
      if (record.remoteSyncStatus === "pending") {
        try {
          const existing = await remote.get(scope.ownerId, record.id);
          if (existing) {
            const merged = { ...mergeNotificationReadState(record, createNotificationRecord(existing, scope)), remoteSyncStatus: "synced" };
            await localPut(merged);
            return merged;
          }
          await remote.create(serializeForFirestore(record));
          const synced = { ...record, remoteSyncStatus: "synced" };
          await localPut(synced);
          return synced;
        } catch { /* Keep the notification durable locally while offline; list() retries later. */ }
      }
      return record;
    },

    async list(scopeOptions) {
      const scope = validateDataScope(scopeOptions ?? {});
      const local = await localList(scope);
      const merged = await syncWithOwner(scope, local);
      return sortNotificationsNewestFirst(merged.filter((record) => record.scopeKey === scope.scopeKey && record.ownerId === scope.ownerId));
    },

    async markRead(id, scopeOptions, { now = new Date() } = {}) {
      const scope = validateDataScope(scopeOptions ?? {});
      const existing = requireOwnedRecord(await localGet(id), id, scope);
      if (existing.readAt) return existing;
      const updated = {
        ...existing,
        readAt: now.toISOString(),
        remoteSyncStatus: scope.ownerId && remote ? "pending" : existing.remoteSyncStatus,
      };
      await localPut(updated);
      if (scope.ownerId && remote) {
        try {
          await remote.markRead(scope.ownerId, id, updated.readAt);
          updated.remoteSyncStatus = "synced";
          await localPut(updated);
        } catch { /* Keep the read state locally and retry when the inbox is refreshed. */ }
      }
      return updated;
    },

    async markAllAsRead(scopeOptions, { now = new Date() } = {}) {
      const scope = validateDataScope(scopeOptions ?? {});
      const unread = (await localList(scope)).filter((record) => !record.readAt);
      const readAt = now.toISOString();
      await Promise.all(unread.map((record) => this.markRead(record.id, scope, { now: new Date(readAt) })));
      return this.list(scope);
    },
  });
}

export const notificationRepository = createNotificationRepository();
