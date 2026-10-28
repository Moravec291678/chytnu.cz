import { catchRepository, outboxRepository } from "../../catches/data/catchRepository.js";
import { tripRepository } from "../../trips/data/tripRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { applyRemotePage, readPendingPulls, readSyncCursor } from "./localSyncRepository.js";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { describeSyncFailure } from "./syncDiagnostics.js";
import { withSyncStage } from "./syncPort.js";

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

function pullStage(entityType, firestoreStage) {
  if (entityType === "catch" && firestoreStage === "get-catch-photo-metadata") return "pull:photos";
  return entityType === "catch" ? "pull:catches" : entityType === "trip" ? "pull:trips" : "pull:waters";
}

function retryPullRecord(change, failure, previous, now) {
  const attempts = (previous?.attempts ?? 0) + 1;
  const retryable = failure?.retryable !== false;
  const delay = Math.min(30 * 60_000, 45_000 * (2 ** Math.min(attempts - 1, 5)));
  return { entityType: change.entityType, entityId: change.entityId, attempts, retryable,
    nextAttemptAt: retryable ? new Date(now + delay).toISOString() : null,
    errorCode: typeof failure?.code === "string" ? failure.code : "unknown",
    errorMessage: describeSyncFailure(failure).message,
    syncStage: failure?.syncStage ?? pullStage(change.entityType, failure?.firestoreStage),
    firestoreStage: failure?.firestoreStage ?? null };
}

function pendingPullDue(item, now, force) {
  if (!item.retryable) return force;
  return force || !item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now;
}

export function createSyncService({ port, getCurrentOwnerId, now = () => Date.now(), onDiagnostic = () => {} }) {
  let inFlight = null;

  async function pull(ownerId, { force = false } = {}) {
    let cursor;
    try { cursor = await readSyncCursor(ownerId); }
    catch (error) { throw withSyncStage(error, "pull:cursor", "local:read-sync-cursor"); }
    let applied = 0;
    let conflicts = 0;
    const pullFailures = new Map();
    const pendingByKey = new Map();
    const pullKey = (change) => JSON.stringify([change.entityType, change.entityId]);
    const previousPull = (change) => {
      const queued = pendingByKey.get(pullKey(change));
      return queued ? queued.remove ? null : queued : pendingPulls.find((item) => pullKey(item) === pullKey(change));
    };

    let pendingPulls;
    try { pendingPulls = await readPendingPulls(ownerId); }
    catch (error) { throw withSyncStage(error, "pull:cursor", "local:read-pending-pulls"); }
    for (const pending of pendingPulls) {
      if (!pendingPullDue(pending, now(), force)) continue;
      if (!activeOwner(getCurrentOwnerId, ownerId)) return { applied, conflicts, stopped: true };
      const change = { entityType: pending.entityType, entityId: pending.entityId, revision: null };
      try {
        const remote = await port.read({ ownerId, entityType: change.entityType, entityId: change.entityId });
        if (!activeOwner(getCurrentOwnerId, ownerId)) return { applied, conflicts, stopped: true };
        if (remote?.photoMetadataError) {
          const failure = withSyncStage(remote.photoMetadataError, pullStage(change.entityType, "get-catch-photo-metadata"), "get-catch-photo-metadata");
          pendingByKey.set(pullKey(change), retryPullRecord(change, failure, pending, now()));
          pullFailures.set(pullKey(change), failure);
        } else {
          pendingByKey.set(pullKey(change), { ...change, remove: true });
          pullFailures.delete(pullKey(change));
          if (remote) {
            const result = await applyRemotePage({ ownerId,
              snapshots: [makeChangeSnapshot({ ...change, revision: remote.revision }, remote)],
              cursor, pendingPullUpdates: [pendingByKey.get(pullKey(change))] });
            applied += result.applied;
            conflicts += result.conflicts;
            pendingByKey.delete(pullKey(change));
          }
        }
      } catch (error) {
        const staged = withSyncStage(error, pullStage(change.entityType, error?.firestoreStage), error?.firestoreStage);
        staged.entityType = change.entityType;
        staged.operation = "pull";
        pendingByKey.set(pullKey(change), retryPullRecord(change, staged, pending, now()));
        pullFailures.set(pullKey(change), staged);
      }
    }
    if (pendingByKey.size) {
      try {
        const result = await applyRemotePage({ ownerId, snapshots: [], cursor, pendingPullUpdates: [...pendingByKey.values()] });
        applied += result.applied;
        conflicts += result.conflicts;
      } catch (error) { throw withSyncStage(error, "pull:merge", "local:apply-deferred-pull-state"); }
    }

    for (let pageNumber = 0; pageNumber < MAX_PULL_PAGES; pageNumber += 1) {
      if (!activeOwner(getCurrentOwnerId, ownerId)) return { applied, conflicts, stopped: true };
      let page;
      try { page = await port.delta({ ownerId, cursor, limit: PAGE_SIZE }); }
      catch (error) { throw withSyncStage(error, "pull:changes", "firestore:query-sync-changes"); }
      if (!activeOwner(getCurrentOwnerId, ownerId)) return { applied, conflicts, stopped: true };
      const latestByEntity = new Map();
      for (const change of page.items) {
        latestByEntity.set(JSON.stringify([change.entityType, change.entityId]), change);
      }
      const snapshots = [];
      const pendingPullUpdates = [];
      for (const change of latestByEntity.values()) {
        if (!activeOwner(getCurrentOwnerId, ownerId)) return { applied, conflicts, stopped: true };
        let remote;
        try { remote = await port.read({ ownerId, entityType: change.entityType, entityId: change.entityId }); }
        catch (error) {
          const staged = withSyncStage(error, pullStage(change.entityType, error?.firestoreStage), error?.firestoreStage);
          staged.entityType = change.entityType;
          staged.operation = "pull";
          pendingPullUpdates.push(retryPullRecord(change, staged, previousPull(change), now()));
          pullFailures.set(pullKey(change), staged);
          continue;
        }
        if (!activeOwner(getCurrentOwnerId, ownerId)) return { applied, conflicts, stopped: true };
        if (remote?.photoMetadataError) {
          const staged = withSyncStage(remote.photoMetadataError, "pull:photos", "get-catch-photo-metadata");
          staged.entityType = "catch";
          staged.operation = "pull";
          pendingPullUpdates.push(retryPullRecord(change, staged, previousPull(change), now()));
          pullFailures.set(pullKey(change), staged);
        } else {
          pendingPullUpdates.push({ ...change, remove: true });
          pullFailures.delete(pullKey(change));
        }
        snapshots.push(makeChangeSnapshot(change, remote));
      }
      if (!activeOwner(getCurrentOwnerId, ownerId)) return { applied, conflicts, stopped: true };
      let result;
      try { result = await applyRemotePage({ ownerId, snapshots, cursor: page.cursor, pendingPullUpdates }); }
      catch (error) { throw withSyncStage(error, "pull:merge", "local:apply-remote-page"); }
      applied += result.applied;
      conflicts += result.conflicts;
      if (!page.hasMore) break;
      if (page.cursor === cursor) throw new Error("Synchronizační kurzor se nepohnul; změny zůstaly lokálně zachované.");
      cursor = page.cursor;
      if (pageNumber === MAX_PULL_PAGES - 1) throw new Error("Synchronizace má příliš mnoho změn k načtení v jednom běhu.");
    }
    const pullFailure = pullFailures.values().next().value;
    if (pullFailure) {
      pullFailure.partialApplied = applied;
      pullFailure.entityType ??= "sync";
      pullFailure.operation ??= "pull";
      throw pullFailure;
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
        const stagedError = withSyncStage(error, `push:${operation.operation}`, error?.firestoreStage);
        const failure = describeSyncFailure(stagedError, operation);
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
      let pullFailure = null;
      for (let pass = 0; pass < MAX_PUSH_PASSES; pass += 1) {
        try {
          const pulled = await pull(ownerId, { force });
          applied += pulled.applied;
          conflicts += pulled.conflicts;
          pullFailure = null;
          if (pulled.stopped || !activeOwner(getCurrentOwnerId, ownerId)) break;
        } catch (error) {
          pullFailure = describeSyncFailure(error);
          applied += Number.isSafeInteger(error?.partialApplied) ? error.partialApplied : 0;
        }
        const pushed = await push(ownerId, force);
        sent += pushed.sent;
        conflicts += pushed.conflicts;
        failure = pushed.transientFailure;
        if (pushed.stopped || !activeOwner(getCurrentOwnerId, ownerId) || pushed.sent === 0) break;
      }
      if (failure) return { status: "error", sent, applied, conflicts, error: failure.message, errorCode: failure.code, failedOperation: failure.operation };
      if (pullFailure) return { status: "error", sent, applied, conflicts, error: pullFailure.message,
        errorCode: pullFailure.code, retryable: pullFailure.retryable, errorName: pullFailure.errorName,
        providerCode: pullFailure.providerCode, syncStage: pullFailure.syncStage, firestoreStage: pullFailure.firestoreStage,
        entityType: pullFailure.entityType, operation: pullFailure.operation };
      return { status: "success", sent, applied, conflicts };
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  return Object.freeze({ run });
}
