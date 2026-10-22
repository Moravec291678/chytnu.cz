import {
  CONFLICT_STORE_NAME,
  openLocalDatabase,
  OUTBOX_STORE_NAME,
  outboxEntityKey,
  queueOutboxOperation,
  PRIVACY_STORE_NAME,
  PROGRESSION_EVENT_STORE_NAME,
  SYNC_STATE_STORE_NAME,
  PHOTO_BINARY_STORE_NAME,
} from "../../catches/data/catchRepository.js";
import { accountScopeKey, isGuestScope, recordScopeKey } from "../../auth/data/localDataScope.js";

const STORES = { catch: "catches", trip: "trips", water: "waters" };

function photoSyncStatus(photos) {
  if (photos.length === 0) return "none";
  return photos.some((photo) => photo.blob) ? "local-only" : "metadata-only";
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readSyncCursor(ownerId) {
  const db = await openLocalDatabase();
  try {
    const transaction = db.transaction(SYNC_STATE_STORE_NAME, "readonly");
    const state = await requestResult(transaction.objectStore(SYNC_STATE_STORE_NAME).get(ownerId));
    return state?.cursor ?? null;
  } finally {
    db.close();
  }
}

export async function readPendingPulls(ownerId) {
  const db = await openLocalDatabase();
  try {
    const transaction = db.transaction(SYNC_STATE_STORE_NAME, "readonly");
    const state = await requestResult(transaction.objectStore(SYNC_STATE_STORE_NAME).get(ownerId));
    return Array.isArray(state?.pendingPulls) ? state.pendingPulls : [];
  } finally { db.close(); }
}

export async function readSyncSummary(ownerId) {
  const db = await openLocalDatabase();
  try {
    const transaction = db.transaction([OUTBOX_STORE_NAME, CONFLICT_STORE_NAME, SYNC_STATE_STORE_NAME], "readonly");
    const [operations, conflicts, syncState] = await Promise.all([
      requestResult(transaction.objectStore(OUTBOX_STORE_NAME).getAll()),
      requestResult(transaction.objectStore(CONFLICT_STORE_NAME).index("ownerId").getAll(ownerId)),
      requestResult(transaction.objectStore(SYNC_STATE_STORE_NAME).get(ownerId)),
    ]);
    const scoped = operations.filter((operation) => operation.ownerId === ownerId);
    const lastFailed = scoped.find((operation) => operation.lastError);
    const pendingPulls = Array.isArray(syncState?.pendingPulls) ? syncState.pendingPulls : [];
    const lastPendingPull = pendingPulls.at(-1);
    const retryAt = [
      ...scoped.filter((operation) => operation.status === "failed" && operation.nextAttemptAt).map((operation) => operation.nextAttemptAt),
      ...pendingPulls.filter((operation) => operation.retryable && operation.nextAttemptAt).map((operation) => operation.nextAttemptAt),
    ].sort()[0] ?? null;
    return {
      pending: scoped.filter((operation) => operation.status !== "conflict").length,
      failed: scoped.filter((operation) => operation.status === "failed").length,
      pullPending: pendingPulls.length,
      pullErrorMessage: lastPendingPull?.errorMessage ?? "",
      pullErrorCode: lastPendingPull?.errorCode ?? "",
      pullRetryable: lastPendingPull?.retryable === true,
      conflicts: conflicts.filter((conflict) => conflict.status === "unresolved").length,
      lastError: lastFailed?.lastError ?? "",
      lastErrorCode: lastFailed?.lastErrorCode ?? "",
      lastErrorEndpoint: lastFailed?.lastEndpoint ?? "",
      nextRetryAt: retryAt,
    };
  } finally {
    db.close();
  }
}

function transactionDone(transaction, db, fallback) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error(fallback)); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error(fallback)); };
  });
}

export async function readGuestSummary(guestScopeKey) {
  if (!isGuestScope(guestScopeKey)) throw new Error("Místní profil není platný.");
  const db = await openLocalDatabase();
  try {
    const transaction = db.transaction(["catches", "trips", PHOTO_BINARY_STORE_NAME], "readonly");
    const [catches, trips, binaries] = await Promise.all([
      requestResult(transaction.objectStore("catches").getAll()),
      requestResult(transaction.objectStore("trips").getAll()),
      requestResult(transaction.objectStore(PHOTO_BINARY_STORE_NAME).index("scopeKey").getAll(guestScopeKey)),
    ]);
    const localCatches = catches.filter((record) => recordScopeKey(record) === guestScopeKey);
    const localTrips = trips.filter((record) => recordScopeKey(record) === guestScopeKey);
    const localCatchIds = new Set(localCatches.map((record) => record.id));
    return {
      catches: localCatches.length,
      trips: localTrips.length,
      photos: localCatches.reduce((count, record) => count + (record.photos ?? []).filter((photo) => photo.blob).length, 0)
        + binaries.filter((photo) => localCatchIds.has(photo.catchId)).length,
    };
  } finally { db.close(); }
}

export async function linkGuestData(ownerId, guestScopeKey) {
  if (typeof ownerId !== "string" || !ownerId) throw new Error("Pro propojení deníku je nutný přihlášený účet.");
  if (!isGuestScope(guestScopeKey)) throw new Error("Místní profil není platný.");
  const accountScope = accountScopeKey(ownerId);
  const db = await openLocalDatabase();
  const transaction = db.transaction(["catches", "trips", "waters", OUTBOX_STORE_NAME, PRIVACY_STORE_NAME, PROGRESSION_EVENT_STORE_NAME, PHOTO_BINARY_STORE_NAME], "readwrite");
  const catchStore = transaction.objectStore("catches");
  const tripStore = transaction.objectStore("trips");
  const waterStore = transaction.objectStore("waters");
  const outbox = transaction.objectStore(OUTBOX_STORE_NAME);
  const privacyStore = transaction.objectStore(PRIVACY_STORE_NAME);
  const progressionStore = transaction.objectStore(PROGRESSION_EVENT_STORE_NAME);
  const photoBinaryStore = transaction.objectStore(PHOTO_BINARY_STORE_NAME);
  const result = { catches: 0, trips: 0, photos: 0 };
  let failure;
  const requests = [catchStore.getAll(), tripStore.getAll(), waterStore.getAll(), outbox.getAll(), privacyStore.get(guestScopeKey), progressionStore.index("scopeKey").getAll(guestScopeKey), photoBinaryStore.index("scopeKey").getAll(guestScopeKey)];
  let loaded = 0;
  const process = () => {
    loaded += 1;
    if (loaded !== requests.length) return;
    try {
      const [allCatches, allTrips, allWaters, allOperations, guestPrivacy, guestProgression, guestPhotoBinaries] = requests.map((request) => request.result);
      const ownerlessTrips = allTrips.filter((record) => recordScopeKey(record) === guestScopeKey);
      const ownerlessCatches = allCatches.filter((record) => recordScopeKey(record) === guestScopeKey);
      const ownerlessWaters = allWaters.filter((record) => recordScopeKey(record) === guestScopeKey);
      const tripsById = new Map(allTrips.map((record) => [record.id, record]));
      for (const record of ownerlessCatches) {
        const linkedTrip = record.tripId ? tripsById.get(record.tripId) : null;
        if (record.tripId && (!linkedTrip || recordScopeKey(linkedTrip) !== guestScopeKey)) {
          throw new Error(`Úlovek ${record.species || record.id} odkazuje na výpravu jiného účtu. Propojení bylo zastaveno.`);
        }
      }
      for (const event of guestProgression) {
        const nextId = `${accountScope}|${event.reasonKey}`;
        progressionStore.delete(event.id);
        progressionStore.put({ ...event, id: nextId, scopeKey: accountScope, ownerId, sync: { status: "local", revision: 1 } });
      }
      if (guestPrivacy) {
        privacyStore.put({ ...guestPrivacy, scopeKey: accountScope, ownerId, updatedAt: new Date().toISOString() });
      }
      const linkedIds = new Set([
        ...ownerlessTrips.map((record) => outboxEntityKey(guestScopeKey, "trip", record.id)),
        ...ownerlessCatches.map((record) => outboxEntityKey(guestScopeKey, "catch", record.id)),
        ...ownerlessWaters.map((record) => outboxEntityKey(guestScopeKey, "water", record.id)),
      ]);
      allOperations.filter((operation) => linkedIds.has(operation.entityKey)).forEach((operation) => outbox.delete(operation.sequence));
      for (const record of ownerlessTrips) {
        queueOutboxOperation(transaction, {
          entityType: "trip", entityId: record.id, operation: "upsert", ownerId,
          scopeKey: accountScope,
          localRevision: Math.max(1, record.sync?.revision ?? 1), baseServerRevision: null,
        }, (revision) => tripStore.put({
          ...record, ownerId, scopeKey: accountScope,
          sync: { ...(record.sync ?? {}), status: "local", revision, serverRevision: undefined },
        }));
      }
      for (const record of ownerlessCatches) {
        const catchBinaries = guestPhotoBinaries.filter((photo) => photo.catchId === record.id);
        const localPhotoIds = new Set((record.photos ?? []).filter((photo) => photo.blob).map((photo) => photo.id));
        for (const photo of catchBinaries) {
          const accountKey = JSON.stringify([accountScope, photo.catchId, photo.photoId]);
          photoBinaryStore.put({ ...photo, key: accountKey, scopeKey: accountScope });
          photoBinaryStore.delete(photo.key);
          localPhotoIds.add(photo.photoId);
        }
        queueOutboxOperation(transaction, {
          entityType: "catch", entityId: record.id, operation: "upsert", ownerId,
          scopeKey: accountScope,
          localRevision: Math.max(1, record.sync?.revision ?? 1), baseServerRevision: null,
        }, (revision) => catchStore.put({
          ...record, ownerId, scopeKey: accountScope,
          sync: {
            ...(record.sync ?? {}), status: "local", revision, serverRevision: undefined,
            photoStatus: localPhotoIds.size ? "local-only" : "none",
          },
        }));
      }
      for (const record of ownerlessWaters) {
        queueOutboxOperation(transaction, {
          entityType: "water", entityId: record.id, operation: "upsert", ownerId,
          scopeKey: accountScope, localRevision: Math.max(1, record.sync?.revision ?? 1), baseServerRevision: null,
        }, (revision) => waterStore.put({ ...record, ownerId, scopeKey: accountScope, sync: { ...(record.sync ?? {}), status: "local", revision } }));
      }
      result.catches = ownerlessCatches.length;
      result.trips = ownerlessTrips.length;
      result.photos = ownerlessCatches.reduce((count, record) => count + (record.photos ?? []).filter((photo) => photo.blob).length, 0)
        + guestPhotoBinaries.filter((photo) => ownerlessCatches.some((record) => record.id === photo.catchId)).length;
    } catch (error) {
      failure = error;
      transaction.abort();
    }
  };
  requests.forEach((request) => {
    request.onsuccess = process;
    request.onerror = () => { failure = request.error; transaction.abort(); };
  });
  try {
    await transactionDone(transaction, db, "Místní deník se nepodařilo propojit. Žádná data nebyla změněna.");
    return result;
  } catch (error) {
    throw failure ?? error;
  }
}

export async function listSyncConflicts(ownerId) {
  const db = await openLocalDatabase();
  try {
    const transaction = db.transaction(CONFLICT_STORE_NAME, "readonly");
    const conflicts = await requestResult(transaction.objectStore(CONFLICT_STORE_NAME).index("ownerId").getAll(ownerId));
    return conflicts.filter((conflict) => conflict.status === "unresolved").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally { db.close(); }
}

export async function resolveSyncConflict(ownerId, conflictId, choice) {
  if (choice !== "local" && choice !== "remote") throw new Error("Vyber verzi konfliktu.");
  const db = await openLocalDatabase();
  const transaction = db.transaction(["catches", "trips", "waters", OUTBOX_STORE_NAME, CONFLICT_STORE_NAME], "readwrite");
  const conflicts = transaction.objectStore(CONFLICT_STORE_NAME);
  const outbox = transaction.objectStore(OUTBOX_STORE_NAME);
  let failure;
  const conflictRequest = conflicts.get(conflictId);
  conflictRequest.onsuccess = () => {
    try {
      const conflict = conflictRequest.result;
      if (!conflict || conflict.ownerId !== ownerId || conflict.status !== "unresolved") throw new Error("Konflikt už není dostupný.");
      const entityStore = transaction.objectStore(STORES[conflict.entityType]);
      const operationRequest = outbox.index("entityKey").get(conflict.entityKey);
      operationRequest.onsuccess = () => {
        try {
          const operation = operationRequest.result;
          if (choice === "local") {
            if (!operation || !conflict.localRecord) throw new Error("Místní verze konfliktu už není dostupná.");
            if (conflict.remoteDeleted) {
              // A server tombstone cannot safely be overwritten. Preserve the
              // local version under a new stable ID and sync it as a new item.
              const newId = crypto.randomUUID();
              const now = new Date().toISOString();
              outbox.delete(operation.sequence);
              entityStore.delete(conflict.entityId);
              const copy = {
                ...conflict.localRecord, id: newId, ownerId, scopeKey: accountScopeKey(ownerId), updatedAt: now,
                sync: { status: "local", revision: 1 },
              };
              queueOutboxOperation(transaction, {
                entityType: conflict.entityType, entityId: newId, operation: "upsert",
                ownerId, localRevision: 1, baseServerRevision: null,
              }, (revision) => entityStore.put({ ...copy, sync: { ...copy.sync, revision } }));
              if (conflict.entityType === "trip") {
                const linkedRequest = transaction.objectStore("catches").getAll();
                linkedRequest.onsuccess = () => {
                  linkedRequest.result.filter((record) => record.tripId === conflict.entityId && recordScopeKey(record) === accountScopeKey(ownerId)).forEach((record) => {
                    queueOutboxOperation(transaction, {
                      entityType: "catch", entityId: record.id, operation: "upsert", ownerId,
                      localRevision: (record.sync?.revision ?? 0) + 1,
                      baseServerRevision: record.sync?.serverRevision ?? null,
                    }, (revision) => transaction.objectStore("catches").put({
                      ...record, tripId: newId, updatedAt: now,
                      sync: { ...(record.sync ?? {}), status: "local", revision },
                    }));
                  });
                };
                linkedRequest.onerror = () => { failure = linkedRequest.error; transaction.abort(); };
              }
            } else {
              outbox.put({
                ...operation, status: "pending", baseServerRevision: conflict.remoteRevision,
                lastError: null, nextAttemptAt: null, updatedAt: new Date().toISOString(),
              });
              entityStore.put({
                ...conflict.localRecord,
                sync: { ...(conflict.localRecord.sync ?? {}), status: "local", serverRevision: conflict.remoteRevision },
              });
            }
          } else {
            if (operation) outbox.delete(operation.sequence);
            if (conflict.remoteDeleted) {
              if (conflict.entityType === "trip") {
                const linkedRequest = transaction.objectStore("catches").getAll();
                linkedRequest.onsuccess = () => {
                  linkedRequest.result.filter((record) => record.tripId === conflict.entityId && recordScopeKey(record) === accountScopeKey(ownerId)).forEach((record) => {
                    queueOutboxOperation(transaction, {
                      entityType: "catch", entityId: record.id, operation: "upsert", ownerId,
                      localRevision: (record.sync?.revision ?? 0) + 1,
                      baseServerRevision: record.sync?.serverRevision ?? null,
                    }, (revision) => transaction.objectStore("catches").put({
                      ...record, tripId: null, updatedAt: new Date().toISOString(),
                      sync: { ...(record.sync ?? {}), status: "local", revision },
                    }));
                  });
                };
                linkedRequest.onerror = () => { failure = linkedRequest.error; transaction.abort(); };
              }
              entityStore.delete(conflict.entityId);
            } else {
              entityStore.put({
                ...conflict.remoteRecord,
                ownerId,
                scopeKey: accountScopeKey(ownerId),
                sync: { status: "metadata-synced", revision: conflict.localRecord?.sync?.revision ?? 0, serverRevision: conflict.remoteRevision },
              });
            }
          }
          conflicts.delete(conflictId);
        } catch (error) { failure = error; transaction.abort(); }
      };
      operationRequest.onerror = () => { failure = operationRequest.error; transaction.abort(); };
    } catch (error) { failure = error; transaction.abort(); }
  };
  conflictRequest.onerror = () => { failure = conflictRequest.error; transaction.abort(); };
  try {
    await transactionDone(transaction, db, "Konflikt se nepodařilo vyřešit. Obě verze zůstaly zachované.");
  } catch (error) { throw failure ?? error; }
}

function metadataOnlyRecord(remote, local = null) {
  if (remote.entityType === "water") {
    return {
      ...remote.record,
      ownerId: remote.record.ownerId,
      scopeKey: accountScopeKey(remote.record.ownerId),
      sync: {
        status: "metadata-synced",
        revision: local?.sync?.revision ?? 0,
        serverRevision: remote.revision,
      },
    };
  }
  const localPhotos = new Map((local?.photos ?? []).filter((photo) => photo.blob).map((photo) => [photo.id, photo]));
  const photos = remote.photoMetadataError
    ? (local?.photos ?? [])
    : (remote.record.photos ?? []).map((photo) => {
    const localPhoto = localPhotos.get(photo.id);
    return localPhoto && !(photo.blob instanceof Blob)
      ? { ...localPhoto, ...photo, blob: localPhoto.blob, photoStatus: "local-only" }
      : { ...photo, photoStatus: photo.photoStatus === "synced" ? "synced" : "metadata-only" };
  });
  return {
    ...remote.record,
    ownerId: remote.record.ownerId,
    scopeKey: accountScopeKey(remote.record.ownerId),
    photos,
    sync: {
      status: "metadata-synced",
      revision: local?.sync?.revision ?? 0,
      serverRevision: remote.revision,
      photoStatus: photoSyncStatus(photos),
    },
  };
}

function catchPhotoMetadataDiffers(localPhotos, remotePhotos) {
  const project = (photos) => (photos ?? []).map((photo) => ({
    id: photo.id, name: photo.name, type: photo.type, size: photo.size,
    focalX: photo.focalX, focalY: photo.focalY, zoom: photo.zoom,
    cloud: photo.cloud ?? null,
  }));
  return JSON.stringify(project(localPhotos)) !== JSON.stringify(project(remotePhotos));
}

function makeConflict(ownerId, snapshot, localRecord) {
  const remoteRevision = snapshot.remote?.revision ?? snapshot.change.revision;
  const id = JSON.stringify([ownerId, snapshot.entityType, snapshot.entityId, remoteRevision]);
  return {
    id,
    ownerId,
    entityKey: outboxEntityKey(accountScopeKey(ownerId), snapshot.entityType, snapshot.entityId),
    entityType: snapshot.entityType,
    entityId: snapshot.entityId,
    localRecord: localRecord ?? null,
    remoteRecord: snapshot.remote?.deleted ? null : snapshot.remote?.record ?? null,
    remoteDeleted: Boolean(snapshot.remote?.deleted),
    remoteRevision,
    reason: localRecord && (localRecord.ownerId ?? null) !== ownerId ? "owner-mismatch" : "concurrent-change",
    status: "unresolved",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Apply one fully fetched delta page atomically. The cursor advances in the
 * same IndexedDB transaction as entity changes and conflict snapshots.
 */
export async function applyRemotePage({ ownerId, snapshots, cursor, pendingPullUpdates = [] }) {
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      ["catches", "trips", "waters", OUTBOX_STORE_NAME, CONFLICT_STORE_NAME, SYNC_STATE_STORE_NAME, PHOTO_BINARY_STORE_NAME],
      "readwrite",
    );
    const outbox = transaction.objectStore(OUTBOX_STORE_NAME);
    const conflicts = transaction.objectStore(CONFLICT_STORE_NAME);
    let applied = 0;
    let conflictCount = 0;
    let failure;

    const putConflict = (snapshot, localRecord, pendingOperation) => {
      const conflict = makeConflict(ownerId, snapshot, localRecord);
      conflicts.put(conflict);
      if (pendingOperation) {
        outbox.put({
          ...pendingOperation,
          status: "conflict",
          lastError: "Vzdálená verze se změnila souběžně. Místní změna zůstává ve frontě.",
          updatedAt: new Date().toISOString(),
        });
      }
      conflictCount += 1;
    };

    const processSnapshot = (index) => {
      if (index >= snapshots.length) {
        const stateStore = transaction.objectStore(SYNC_STATE_STORE_NAME);
        const stateRequest = stateStore.get(ownerId);
        stateRequest.onsuccess = () => {
          const current = stateRequest.result ?? { ownerId, cursor: null };
          const deferred = new Map((Array.isArray(current.pendingPulls) ? current.pendingPulls : [])
            .map((item) => [JSON.stringify([item.entityType, item.entityId]), item]));
          for (const item of pendingPullUpdates) {
            const key = JSON.stringify([item.entityType, item.entityId]);
            if (item.remove) deferred.delete(key);
            else deferred.set(key, item);
          }
          const nextState = { ...current, ownerId, cursor,
            ...(deferred.size ? { pendingPulls: [...deferred.values()] } : { pendingPulls: [] }) };
          stateStore.put(nextState);
        };
        stateRequest.onerror = () => { failure = stateRequest.error; transaction.abort(); };
        return;
      }
      const snapshot = snapshots[index];
      const entityStore = transaction.objectStore(STORES[snapshot.entityType]);
      const localRequest = entityStore.get(snapshot.entityId);
      const operationRequest = outbox.index("entityKey").get(outboxEntityKey(accountScopeKey(ownerId), snapshot.entityType, snapshot.entityId));
      let localRecord;
      let pendingOperation;
      let loaded = 0;
      const onLoaded = () => {
        loaded += 1;
        if (loaded !== 2) return;
        localRecord = localRequest.result;
        pendingOperation = operationRequest.result;
        const remote = snapshot.remote;

        if (!remote) {
          processSnapshot(index + 1);
          return;
        }

        const ownEcho = pendingOperation
          && remote.lastOperationId === pendingOperation.operationId
          && remote.clientLocalRevision === pendingOperation.localRevision;
        if (ownEcho) {
          outbox.delete(pendingOperation.sequence);
          if (pendingOperation.operation === "upsert" && localRecord?.sync?.revision === pendingOperation.localRevision) {
            const acceptedRecord = snapshot.entityType === "catch"
              ? metadataOnlyRecord(remote, localRecord)
              : { ...localRecord };
            const saveAcceptedRecord = (hasLocalPhotos) => entityStore.put({
              ...acceptedRecord,
              sync: {
                ...localRecord.sync,
                status: "metadata-synced",
                serverRevision: remote.revision,
                photoStatus: (acceptedRecord.photos ?? []).length === 0 ? "none"
                  : hasLocalPhotos ? "local-only" : "metadata-only",
              },
            });
            if (snapshot.entityType === "catch" && acceptedRecord.photos?.length) {
              const localBinaries = transaction.objectStore(PHOTO_BINARY_STORE_NAME).index("catchPhoto")
                .getAll([accountScopeKey(ownerId), snapshot.entityId]);
              localBinaries.onsuccess = () => {
                const localIds = new Set(localBinaries.result.map((photo) => photo.photoId));
                saveAcceptedRecord((acceptedRecord.photos ?? []).some((photo) => photo.blob || localIds.has(photo.id)));
              };
              localBinaries.onerror = () => { failure = localBinaries.error; transaction.abort(); };
            } else saveAcceptedRecord(snapshot.entityType === "catch" && (acceptedRecord.photos ?? []).some((photo) => photo.blob));
          }
          processSnapshot(index + 1);
          return;
        }

        // A previous attempt may have committed remotely while its local ACK
        // was interrupted, and the user may have edited the same queued item
        // meanwhile. Treat the lower remote revision as the base for that
        // same operation instead of reporting a concurrent-device conflict.
        const sameOperationContinuation = pendingOperation
          && remote.lastOperationId === pendingOperation.operationId
          && Number.isSafeInteger(remote.clientLocalRevision)
          && remote.clientLocalRevision < pendingOperation.localRevision;
        if (sameOperationContinuation) {
          outbox.put({
            ...pendingOperation,
            baseServerRevision: remote.revision,
            updatedAt: new Date().toISOString(),
          });
          processSnapshot(index + 1);
          return;
        }

        if (pendingOperation) {
          putConflict(snapshot, localRecord, pendingOperation);
          processSnapshot(index + 1);
          return;
        }

        if (localRecord && recordScopeKey(localRecord) !== accountScopeKey(ownerId)) {
          putConflict(snapshot, localRecord, null);
          processSnapshot(index + 1);
          return;
        }

        const localServerRevision = localRecord?.sync?.serverRevision ?? 0;
        const recoveredPhotoMetadata = snapshot.entityType === "catch" && !remote.photoMetadataError
          && catchPhotoMetadataDiffers(localRecord?.photos, remote.record.photos);
        if (localRecord && localServerRevision >= remote.revision && !recoveredPhotoMetadata) {
          processSnapshot(index + 1);
          return;
        }

        if (localRecord && localRecord.sync?.status !== "metadata-synced") {
          putConflict(snapshot, localRecord, null);
          processSnapshot(index + 1);
          return;
        }

        if (remote.deleted) {
          if (snapshot.entityType === "trip") {
            const linkedRequest = transaction.objectStore("catches").getAll();
            linkedRequest.onsuccess = () => {
              if (linkedRequest.result.some((item) => item.tripId === snapshot.entityId
                && recordScopeKey(item) === accountScopeKey(ownerId))) {
                putConflict(snapshot, localRecord, null);
              } else if (localRecord) {
                entityStore.delete(snapshot.entityId);
                applied += 1;
              }
              processSnapshot(index + 1);
            };
            linkedRequest.onerror = () => { failure = linkedRequest.error; transaction.abort(); };
          } else if (localRecord) {
            entityStore.delete(snapshot.entityId);
            applied += 1;
            processSnapshot(index + 1);
          } else processSnapshot(index + 1);
          return;
        }

        const mergedRecord = metadataOnlyRecord(remote, localRecord);
        if (snapshot.entityType === "catch" && mergedRecord.photos?.length) {
          const localBinaries = transaction.objectStore(PHOTO_BINARY_STORE_NAME).index("catchPhoto")
            .getAll([accountScopeKey(ownerId), snapshot.entityId]);
          localBinaries.onsuccess = () => {
            const localIds = new Set(localBinaries.result.map((photo) => photo.photoId));
            entityStore.put({ ...mergedRecord, sync: { ...mergedRecord.sync,
              photoStatus: mergedRecord.photos.some((photo) => photo.blob || localIds.has(photo.id)) ? "local-only" : "metadata-only" } });
            applied += 1;
            processSnapshot(index + 1);
          };
          localBinaries.onerror = () => { failure = localBinaries.error; transaction.abort(); };
        } else {
          entityStore.put(mergedRecord);
          applied += 1;
          processSnapshot(index + 1);
        }
      };
      localRequest.onsuccess = onLoaded;
      operationRequest.onsuccess = onLoaded;
      localRequest.onerror = () => { failure = localRequest.error; transaction.abort(); };
      operationRequest.onerror = () => { failure = operationRequest.error; transaction.abort(); };
    };

    processSnapshot(0);
    transaction.oncomplete = () => {
      db.close();
      resolve({ applied, conflicts: conflictCount, cursor });
    };
    transaction.onerror = () => {
      db.close();
      reject(failure ?? transaction.error ?? new Error("Změny ze synchronizace se nepodařilo uložit."));
    };
    transaction.onabort = () => {
      db.close();
      reject(failure ?? transaction.error ?? new Error("Uložení synchronizace bylo přerušeno."));
    };
  });
}
