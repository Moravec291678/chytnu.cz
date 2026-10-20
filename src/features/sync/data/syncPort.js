const ENTITY_TYPES = new Set(["catch", "trip", "water"]);
const ERROR_CODES = new Set([
  "invalid_request",
  "not_found",
  "conflict",
  "permission_denied",
  "unavailable",
  "unsupported",
  "unknown",
]);

export class SyncPortError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "SyncPortError";
    this.code = ERROR_CODES.has(code) ? code : "unknown";
    this.retryable = code === "unavailable";
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SyncPortError("invalid_request", `${name} musí být neprázdný text.`);
  }
  return value;
}

function requireEntityType(entityType) {
  if (!ENTITY_TYPES.has(entityType)) {
    throw new SyncPortError("invalid_request", "Nepodporovaný typ záznamu.");
  }
  return entityType;
}

function requireRevision(revision, name = "revision") {
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) {
    throw new SyncPortError("invalid_request", `${name} musí být nezáporné celé číslo nebo null.`);
  }
  return revision;
}

function normalizeError(error) {
  if (error instanceof SyncPortError) return error;
  const code = ERROR_CODES.has(error?.code) ? error.code : "unknown";
  return new SyncPortError(code, error?.message || "Synchronizační úložiště vrátilo chybu.", { cause: error });
}

/**
 * Provider-neutral remote contract. Owner identity is explicit on every call;
 * local repositories intentionally do not implement this contract until a
 * user explicitly links local data to an account.
 */
export function createSyncPort(adapter) {
  const methods = ["read", "write", "delete", "list", "delta"];
  if (!adapter || methods.some((method) => typeof adapter[method] !== "function")) {
    throw new SyncPortError("invalid_request", "Sync adapter musí implementovat read, write, delete, list a delta.");
  }

  async function call(method, args) {
    try {
      return await adapter[method](args);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  return Object.freeze({
    read: (args) => call("read", {
      ownerId: requireString(args?.ownerId, "ownerId"),
      entityType: requireEntityType(args?.entityType),
      entityId: requireString(args?.entityId, "entityId"),
    }),
    write: (args) => {
      const record = args?.record;
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new SyncPortError("invalid_request", "Záznam musí být objekt.");
      }
      const recordId = requireString(record.id, "record.id");
      const localRevision = args?.localRevision;
      if (!Number.isSafeInteger(localRevision) || localRevision < 1) {
        throw new SyncPortError("invalid_request", "localRevision musí být kladné celé číslo.");
      }
      if (args.entityId && args.entityId !== recordId) {
        throw new SyncPortError("invalid_request", "entityId musí odpovídat ID záznamu.");
      }
      return call("write", {
        ownerId: requireString(args.ownerId, "ownerId"),
        entityType: requireEntityType(args.entityType),
        entityId: recordId,
        record,
        expectedRevision: requireRevision(args.expectedRevision, "expectedRevision"),
        operationId: requireString(args.operationId, "operationId"),
        localRevision,
      });
    },
    delete: (args) => {
      const localRevision = args?.localRevision;
      if (!Number.isSafeInteger(localRevision) || localRevision < 1) {
        throw new SyncPortError("invalid_request", "localRevision musí být kladné celé číslo.");
      }
      return call("delete", {
        ownerId: requireString(args?.ownerId, "ownerId"),
        entityType: requireEntityType(args?.entityType),
        entityId: requireString(args?.entityId, "entityId"),
        expectedRevision: requireRevision(args?.expectedRevision, "expectedRevision"),
        operationId: requireString(args?.operationId, "operationId"),
        localRevision,
      });
    },
    list: (args) => call("list", {
      ownerId: requireString(args?.ownerId, "ownerId"),
      entityType: requireEntityType(args?.entityType),
      cursor: args?.cursor ?? null,
      limit: args?.limit ?? 100,
    }),
    delta: (args) => call("delta", {
      ownerId: requireString(args?.ownerId, "ownerId"),
      cursor: args?.cursor ?? null,
      limit: args?.limit ?? 100,
    }),
  });
}

export const syncEntityTypes = Object.freeze([...ENTITY_TYPES]);
