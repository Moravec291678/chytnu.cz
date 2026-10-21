import { catchRepository, outboxRepository } from "../../catches/data/catchRepository.js";
import { tripRepository } from "../../trips/data/tripRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { applyRemotePage, readSyncCursor } from "./localSyncRepository.js";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { describeSyncFailure } from "./syncDiagnostics.js";

const REPOSITORIES = { catch: catchRepository, trip: tripRepository, water: waterRepository };
const PAGE_SIZE = 100;
const MAX_PULL_PAGES = 100;
const MAX_PUSH_PASSES = 3;

function activeOwner(getCurrentOwnerId, ownerId) {
  return getCurrentOwnerId() === ownerId;
}

function makeChangeSnapshot(change, remote) {
  return {
    change,
    entityType: change.entityType,
    entityId: change.entityId,
    remote,
  };
}

function isDue(operation, now) {
  if (operation.status === "conflict") return false;
  if (operation.status !== "failed") return true;
  return !operation.nextAttemptAt || Date.parse(operation.nextAttemptAt) <= now;
}

export function createSyncService({ port, getCurrentOwnerId, now = () => Date.now(), onDiagnostic = () => {} }) {
  let inFlight = null;

  async function pull(ownerId) {
    let cursor = await readSyncCursor(ownerId);
    let applied = 0;
    let conflicts = 0;

    for (let pageNumber = 0; pageNumber < MAX_PULL_PAGES; pageNumber += 1) {
      if (!activeOwner(getCurrentOwnerId, ownerId)) return { applied, conflicts, stopped: true };
      const page = await port.delta({ ownerId, cursor, limit: PAGE_SIZE });
      const latestByEntity = new Map();
      for (const change of page.items) {
        latestByEntity.set(JSON.stringify([change.entityType, change.entityId]), change);
      }
      const snapshots = [];
      for (const change of latestByEntity.values()) {
        if (!activeOwner(getCurrentOwnerId, ownerId)) return { applied, conflicts, stopped: true };
        const remote = await port.read({ ownerId, entityType: change.entityType, entityId: change.entityId });
        snapshots.push(makeChangeSnapshot(change, remote));
      }
      const result = await applyRemotePage({ ownerId, snapshots, cursor: page.cursor });
      applied += result.applied;
      conflicts += result.conflicts;
      if (!page.hasMore) break;
      if (page.cursor === cursor) throw new Error("Synchronizační kurzor se nepohnul; změny zůstaly lokálně zachované.");
      cursor = page.cursor;
      if (pageNumber === MAX_PULL_PAGES - 1) throw new Error("Synchronizace má příliš mnoho změn k načtení v jednom běhu.");
    }
    return { applied, conflicts, stopped: false };
  }

  async function push(ownerId, force = false) {
    const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
    let sent = 0;
    let conflicts = 0;
    let transientFailure = null;
    const operations = await outboxRepository.list();
    for (const operation of operations) {
      if (operation.ownerId !== ownerId || (!force && !isDue(operation, now()))) continue;
      if (!activeOwner(getCurrentOwnerId, ownerId)) return { sent, conflicts, stopped: true, transientFailure };
      const repository = REPOSITORIES[operation.entityType];
      if (!repository) continue;

      try {
        let result;
        if (operation.operation === "delete") {
          result = await port.delete({
            ownerId,
            entityType: operation.entityType,
            entityId: operation.entityId,
            expectedRevision: operation.baseServerRevision ?? null,
            operationId: operation.operationId,
            localRevision: operation.localRevision,
          });
        } else {
          const record = await repository.get(operation.entityId, scope);
          if (!record || record.ownerId !== ownerId || record.sync?.revision !== operation.localRevision) continue;
          result = await port.write({
            ownerId,
            entityType: operation.entityType,
            record,
            expectedRevision: operation.baseServerRevision ?? null,
            operationId: operation.operationId,
            localRevision: operation.localRevision,
          });
        }
        if (!activeOwner(getCurrentOwnerId, ownerId)) return { sent, conflicts, stopped: true, transientFailure };
        if (await outboxRepository.acknowledge(operation.operationId, operation.localRevision, result.revision)) sent += 1;
      } catch (error) {
        if (error?.code === "conflict") {
          const remote = await port.read({ ownerId, entityType: operation.entityType, entityId: operation.entityId });
          const cursor = await readSyncCursor(ownerId);
          await applyRemotePage({
            ownerId,
            snapshots: [makeChangeSnapshot({ entityType: operation.entityType, entityId: operation.entityId, revision: remote?.revision ?? 0 }, remote ?? {
              entityType: operation.entityType,
              entityId: operation.entityId,
              revision: 0,
              deleted: true,
              record: null,
            })],
            cursor,
          });
          conflicts += 1;
          continue;
        }
        const failure = describeSyncFailure(error, operation);
        await outboxRepository.markFailed(operation.operationId, failure.message, failure);
        onDiagnostic({ event: "push-failed", ...failure });
        transientFailure = failure;
        if (error?.retryable || error?.code === "permission_denied" || error?.code === "unauthenticated") break;
      }
    }
    return { sent, conflicts, stopped: false, transientFailure };
  }

  async function run(ownerId, { force = false } = {}) {
    if (!ownerId || !activeOwner(getCurrentOwnerId, ownerId)) return { status: "signed-out", sent: 0, applied: 0, conflicts: 0 };
    if (inFlight) return inFlight;
    inFlight = (async () => {
      let sent = 0;
      let applied = 0;
      let conflicts = 0;
      let failure = null;
      for (let pass = 0; pass < MAX_PUSH_PASSES; pass += 1) {
        const pulled = await pull(ownerId);
        applied += pulled.applied;
        conflicts += pulled.conflicts;
        if (pulled.stopped || !activeOwner(getCurrentOwnerId, ownerId)) break;
        const pushed = await push(ownerId, force);
        sent += pushed.sent;
        conflicts += pushed.conflicts;
        failure = pushed.transientFailure;
        if (pushed.stopped || !activeOwner(getCurrentOwnerId, ownerId) || pushed.sent === 0) break;
      }
      if (failure) return { status: "error", sent, applied, conflicts, error: failure.message, errorCode: failure.code, failedOperation: failure.operation };
      return { status: "success", sent, applied, conflicts };
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  return Object.freeze({ run });
}
