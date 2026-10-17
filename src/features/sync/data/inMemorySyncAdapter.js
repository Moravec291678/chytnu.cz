import { SyncPortError } from "./syncPort.js";

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function remoteProjection(record) {
  if (!Array.isArray(record.photos)) return record;
  return {
    ...record,
    photos: (record.photos ?? []).map(({ blob, ...photo }) => ({
      ...photo,
      type: photo.type ?? blob?.type ?? "image/jpeg",
      size: blob?.size ?? photo.size ?? 0,
    })),
  };
}

/** In-memory provider fake for contract tests. It is never used by app runtime. */
export function createInMemorySyncAdapter() {
  const records = new Map();
  const receipts = new Map();
  const changes = [];
  let sequence = 0;

  const keyOf = ({ ownerId, entityType, entityId }) => `${ownerId}\u0000${entityType}\u0000${entityId}`;
  const receiptKey = ({ ownerId, operationId, localRevision }) => `${ownerId}\u0000${operationId}\u0000${localRevision}`;
  const appendChange = (change) => {
    const cursor = String(++sequence);
    changes.push({ ...clone(change), cursor, sequence: Number(cursor) });
    return cursor;
  };

  function applyWrite({ ownerId, entityType, entityId, record, expectedRevision, operationId, localRevision }) {
    const receiptId = receiptKey({ ownerId, operationId, localRevision });
    const projected = remoteProjection(record);
    const digest = JSON.stringify(projected);
    if (receipts.has(receiptId)) {
      const previous = receipts.get(receiptId);
      if (previous.digest !== digest) throw new SyncPortError("conflict", "Stejné ID operace obsahuje jinou změnu.");
      return clone(previous.result);
    }
    const key = keyOf({ ownerId, entityType, entityId });
    const current = records.get(key);
    const currentRevision = current?.revision ?? null;
    const continuation = current?.lastOperationId === operationId && localRevision > current.clientLocalRevision;
    if (current?.deleted || (!continuation && currentRevision !== expectedRevision)) {
      throw new SyncPortError("conflict", "Záznam se od poslední synchronizace změnil.");
    }
    const revision = (currentRevision ?? 0) + 1;
    const cursor = appendChange({ ownerId, entityType, entityId, revision, operationId, localRevision, kind: "upsert" });
    const result = {
      record: clone(projected), entityType, entityId, revision, operationId,
      localRevision, cursor, lastOperationId: operationId, clientLocalRevision: localRevision,
    };
    records.set(key, {
      record: clone(projected), revision, deleted: false,
      lastOperationId: operationId, clientLocalRevision: localRevision,
    });
    receipts.set(receiptId, { digest, result: clone(result) });
    return clone(result);
  }

  return {
    async read({ ownerId, entityType, entityId }) {
      const stored = records.get(keyOf({ ownerId, entityType, entityId }));
      if (!stored) return null;
      return {
        ...(stored.deleted ? {} : { record: clone(stored.record) }),
        entityType, entityId, revision: stored.revision, deleted: stored.deleted,
        lastOperationId: stored.lastOperationId, clientLocalRevision: stored.clientLocalRevision,
      };
    },

    async write(args) {
      return applyWrite(args);
    },

    async delete({ ownerId, entityType, entityId, expectedRevision, operationId, localRevision }) {
      const receiptId = receiptKey({ ownerId, operationId, localRevision });
      if (receipts.has(receiptId)) return clone(receipts.get(receiptId).result);
      const key = keyOf({ ownerId, entityType, entityId });
      const current = records.get(key);
      const currentRevision = current?.revision ?? null;
      const continuation = current?.lastOperationId === operationId && localRevision > current.clientLocalRevision;
      if (current?.deleted || (!continuation && currentRevision !== expectedRevision)) {
        throw new SyncPortError(current ? "conflict" : "not_found", current
          ? "Záznam se od poslední synchronizace změnil."
          : "Záznam nebyl nalezen.");
      }
      const revision = (currentRevision ?? 0) + 1;
      const cursor = appendChange({ ownerId, entityType, entityId, revision, operationId, localRevision, kind: "delete" });
      const result = { entityType, entityId, revision, operationId, localRevision, cursor };
      records.set(key, { record: null, revision, deleted: true, lastOperationId: operationId, clientLocalRevision: localRevision });
      receipts.set(receiptId, { digest: "delete", result: clone(result) });
      return clone(result);
    },

    async list({ ownerId, entityType, cursor = null, limit: pageSize = 100 }) {
      const items = [];
      for (const [key, value] of records) {
        const [recordOwner, recordType] = key.split("\u0000");
        if (!value.deleted && recordOwner === ownerId && recordType === entityType) {
          items.push({ record: clone(value.record), entityType, entityId: value.record.id, revision: value.revision });
        }
      }
      const start = cursor ? Math.max(0, items.findIndex((item) => item.entityId === cursor) + 1) : 0;
      const page = items.slice(start, start + pageSize);
      return { items: page, cursor: page.at(-1)?.entityId ?? cursor, hasMore: start + pageSize < items.length };
    },

    async delta({ ownerId, cursor = null, limit: pageSize = 100 }) {
      const after = cursor === null ? 0 : Number(cursor);
      if (!Number.isSafeInteger(after) || after < 0 || after > sequence) {
        throw new SyncPortError("invalid_request", "Neplatný synchronizační kurzor.");
      }
      const ownerChanges = changes.filter((change) => change.ownerId === ownerId && change.sequence > after);
      const items = ownerChanges.slice(0, pageSize);
      return {
        items: clone(items),
        cursor: items.at(-1)?.cursor ?? (ownerChanges.length ? cursor : String(sequence)),
        hasMore: ownerChanges.length > pageSize,
      };
    },
  };
}
