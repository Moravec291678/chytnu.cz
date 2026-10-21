import { accountScopeKey, validateDataScope } from "../../auth/data/localDataScope.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { catchRepository, outboxRepository, photoCloudOutboxRepository } from "./catchRepository.js";
import {
  createPhotoObjectKey,
  getPhotoCloudProvider,
  nonePhotoCloudProvider,
  PHOTO_CLOUD_STATE,
  preparePhotoForCloud,
  sha256Blob,
} from "./photoCloudProvider.js";

function due(operation, now, force) {
  if (operation.status === "conflict") return false;
  if (operation.status !== "failed") return true;
  return force || !operation.nextAttemptAt || Date.parse(operation.nextAttemptAt) <= now;
}

function isActive(getCurrentOwnerId, ownerId) {
  return getCurrentOwnerId() === ownerId;
}

function safePhotoCloud(photo) {
  return photo?.cloud ?? { state: PHOTO_CLOUD_STATE.LOCAL_ONLY, provider: null, objectKey: null, sha256: null };
}

function photoEndpointError(path, response, result) {
  const code = result.error ?? (response.status === 429 ? "rate_limited" : "photo_cloud_failed");
  const error = Object.assign(new Error(response.status === 401 ? "Přihlášení k fotografiím se nezdařilo."
    : response.status === 403 ? "K této fotografii nemáš přístup."
      : response.status === 429 ? "Cloudové úložiště dočasně omezuje požadavky."
        : response.status >= 500 ? "Server cloudových fotografií dočasně není dostupný."
          : "Cloudový požadavek na fotografii nebyl přijat."), { code, status: response.status, endpoint: path });
  return error;
}

export function createAuthenticatedPhotoEndpointCaller({
  getIdToken = (forceRefresh) => firebaseAuth.currentIdToken(forceRefresh),
  fetchImpl = globalThis.fetch,
} = {}) {
  return async function callAuthenticatedPhotoEndpoint(path, payload) {
    let idToken;
    try { idToken = await getIdToken(false); }
    catch { throw Object.assign(new Error("Firebase přihlášení nelze ověřit."), { code: "firebase_token_invalid", endpoint: path }); }
    if (!idToken) throw Object.assign(new Error("Pro synchronizaci fotografií je potřeba přihlášení."), { code: "missing_firebase_user", endpoint: path });

    const send = async (token) => {
      let response;
      try {
        response = await fetchImpl(path, {
          method: "POST",
          credentials: "same-origin",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        throw Object.assign(new Error("Server pro cloudové fotografie není dostupný."), { code: "photo_cloud_network_error", endpoint: path });
      }
      let result;
      try { result = await response.json(); } catch { result = {}; }
      return { response, result };
    };

    let attempt = await send(idToken);
    if (attempt.response.status === 401 && ["invalid_auth", "firebase_token_expired"].includes(attempt.result.error)) {
      try { idToken = await getIdToken(true); }
      catch { throw Object.assign(new Error("Obnovení Firebase přihlášení se nezdařilo."), { code: "token_refresh_failed", status: 401, endpoint: path }); }
      if (!idToken) throw Object.assign(new Error("Firebase přihlášení po obnovení není dostupné."), { code: "token_refresh_failed", status: 401, endpoint: path });
      attempt = await send(idToken);
      if (attempt.response.status === 401 && ["invalid_auth", "firebase_token_expired"].includes(attempt.result.error)) {
        throw Object.assign(new Error("Server odmítl obnovené Firebase přihlášení."), { code: "firebase_token_invalid", status: 401, endpoint: path });
      }
    }
    if (!attempt.response.ok) throw photoEndpointError(path, attempt.response, attempt.result);
    return attempt.result;
  };
}

const callAuthenticatedPhotoEndpoint = createAuthenticatedPhotoEndpointCaller();

export function createPhotoCloudService({
  provider = nonePhotoCloudProvider,
  resolveProvider = (providerId) => providerId === provider.id ? provider : null,
  catches = catchRepository,
  queue = photoCloudOutboxRepository,
  operationOutbox = outboxRepository,
  getCurrentOwnerId = () => null,
  now = () => Date.now(),
  prepare = (photo) => preparePhotoForCloud(photo),
  authenticatedRequest = callAuthenticatedPhotoEndpoint,
} = {}) {
  let inFlight = null;

  async function reconcileUploads(ownerId) {
    const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
    const records = await catches.list(scope);
    let queued = 0;
    for (const record of records) {
      if (!isActive(getCurrentOwnerId, ownerId)) return queued;
      for (const photo of record.photos ?? []) {
        if (!(photo.blob instanceof Blob)) continue;
        const sha256 = await sha256Blob(photo.blob);
        const objectKey = createPhotoObjectKey(ownerId, record.id, photo.id);
        const cloud = safePhotoCloud(photo);
        if (cloud.state === PHOTO_CLOUD_STATE.SYNCED
          && cloud.provider === provider.id
          && cloud.objectKey === objectKey
          && cloud.sha256 === sha256) continue;
        const accepted = await queue.enqueue({
          ownerId,
          catchId: record.id,
          photoId: photo.id,
          operation: "upload",
          provider: provider.id,
          objectKey,
          sha256,
          size: photo.blob.size,
          contentType: photo.blob.type || photo.type || "application/octet-stream",
        });
        if (accepted) queued += 1;
        await catches.setPhotoCloudState(record.id, photo.id, {
          state: PHOTO_CLOUD_STATE.PENDING_UPLOAD,
          provider: provider.id,
          objectKey,
          sha256,
        }, scope);
      }
    }
    return queued;
  }

  async function saveSyncedPhotoMetadata(job, photoCloud) {
    const scope = { ownerId: job.ownerId, scopeKey: accountScopeKey(job.ownerId) };
    const record = await catches.get(job.catchId, scope);
    if (!record) return false;
    const photo = (record.photos ?? []).find((item) => item.id === job.photoId);
    if (!photo?.blob || await sha256Blob(photo.blob) !== job.sha256) return false;
    const photos = record.photos.map((item) => item.id === job.photoId ? { ...item, cloud: photoCloud } : item);
    await catches.put({
      ...record,
      photos,
      updatedAt: new Date(now()).toISOString(),
      sync: { ...(record.sync ?? {}), status: "local", revision: (record.sync?.revision ?? 0) + 1 },
    }, scope);
    return true;
  }

  async function processUpload(operation) {
    const job = operation.photoCloud;
    const scope = { ownerId: operation.ownerId, scopeKey: operation.scopeKey };
    const record = await catches.get(job.catchId, scope);
    const photo = record?.photos?.find((item) => item.id === job.photoId);
    if (!photo?.blob || await sha256Blob(photo.blob) !== job.sha256) {
      await queue.complete(operation.operationId, operation.localRevision);
      return { uploaded: 0, deleted: 0 };
    }
    const prepared = await prepare(photo);
    const blob = prepared.original;
    const actualHash = await sha256Blob(blob);
    if (actualHash !== job.sha256) throw new Error("Příprava fotografie změnila její originální bytes.");
    await provider.upload({
      ownerId: job.ownerId,
      catchId: job.catchId,
      photoId: job.photoId,
      blob,
      objectKey: job.objectKey,
      sha256: job.sha256,
      contentType: job.contentType,
      size: job.size,
      requestUploadGrant: (photo) => authenticatedRequest("/api/cloudinary/sign", photo),
      requestUploadVerification: (photo) => authenticatedRequest("/api/cloudinary/verify-upload", photo),
    });
    if (!isActive(getCurrentOwnerId, operation.ownerId)) return { uploaded: 0, deleted: 0, stopped: true };
    if (!await queue.isCurrent(operation.operationId, operation.localRevision)) return { uploaded: 1, deleted: 0 };
    const saved = await saveSyncedPhotoMetadata(job, {
      state: PHOTO_CLOUD_STATE.SYNCED,
      provider: provider.id,
      objectKey: job.objectKey,
      sha256: job.sha256,
    });
    if (saved) await queue.complete(operation.operationId, operation.localRevision);
    else await queue.complete(operation.operationId, operation.localRevision);
    return { uploaded: saved ? 1 : 0, deleted: 0 };
  }

  async function processDelete(operation) {
    const job = operation.photoCloud;
    if (job.dependsOnCatchOperationId) {
      const pendingCatchOperations = await operationOutbox.list();
      if (pendingCatchOperations.some((item) => item.operationId === job.dependsOnCatchOperationId)) {
        return { uploaded: 0, deleted: 0, deferred: true };
      }
      const currentCatch = await catches.get(job.catchId, { ownerId: job.ownerId, scopeKey: operation.scopeKey });
      if (currentCatch && (currentCatch.sync?.status !== "metadata-synced"
        || currentCatch.sync?.revision < job.dependsOnCatchRevision)) {
        return { uploaded: 0, deleted: 0, deferred: true };
      }
    }
    const deleteProvider = resolveProvider(job.provider);
    if (!deleteProvider || !await deleteProvider.isAvailable({ ownerId: job.ownerId })) {
      throw new Error("Poskytovatel smazané fotografie není dostupný.");
    }
    await deleteProvider.delete({
      ownerId: job.ownerId,
      catchId: job.catchId,
      photoId: job.photoId,
      provider: job.provider,
      objectKey: job.objectKey,
      sha256: job.sha256,
      requestDeleteGrant: (photo) => authenticatedRequest("/api/cloudinary/delete", photo),
    });
    if (!isActive(getCurrentOwnerId, operation.ownerId)) return { uploaded: 0, deleted: 0, stopped: true };
    await queue.complete(operation.operationId, operation.localRevision);
    return { uploaded: 0, deleted: 1 };
  }

  async function runOnce(ownerId, { force = false } = {}) {
    if (!ownerId || !isActive(getCurrentOwnerId, ownerId)) return { status: "signed-out", uploaded: 0, deleted: 0, queued: 0 };
    if (!await provider.isAvailable({ ownerId })) return { status: "local-only", uploaded: 0, deleted: 0, queued: 0 };
    const queued = await reconcileUploads(ownerId);
    let uploaded = 0;
    let deleted = 0;
    let error = null;
    const operations = await queue.list();
    for (const operation of operations) {
      if (operation.ownerId !== ownerId || !due(operation, now(), force)) continue;
      if (!isActive(getCurrentOwnerId, ownerId)) break;
      try {
        const result = operation.operation === "photo-upload"
          ? await processUpload(operation)
          : operation.operation === "photo-delete"
            ? await processDelete(operation)
            : null;
        uploaded += result?.uploaded ?? 0;
        deleted += result?.deleted ?? 0;
        if (result?.stopped) break;
      } catch (failure) {
        error = failure;
        await operationOutbox.markFailed(operation.operationId, failure?.message, {
          code: failure?.code,
          providerCode: failure?.providerCode,
          endpoint: failure?.endpoint,
        });
        const job = operation.photoCloud;
        if (operation.operation === "photo-upload") {
          await catches.setPhotoCloudState(job.catchId, job.photoId, {
            state: PHOTO_CLOUD_STATE.UPLOAD_FAILED,
            provider: job.provider,
            objectKey: job.objectKey,
            sha256: job.sha256,
          }, { ownerId, scopeKey: accountScopeKey(ownerId) }).catch(() => {});
        }
        break;
      }
    }
    return { status: error ? "error" : "success", uploaded, deleted, queued, error: error?.message ?? "",
      errorCode: error?.code ?? "photo_cloud_failed", errorEndpoint: error?.endpoint ?? "" };
  }

  return Object.freeze({
    run(ownerId, options) {
      if (inFlight) return inFlight;
      inFlight = runOnce(ownerId, options ?? {}).finally(() => { inFlight = null; });
      return inFlight;
    },
    async getPhotoBlob({ photo, ownerId, catchId, scopeKey }) {
      const scope = validateDataScope({ scopeKey, ownerId });
      if (photo?.blob instanceof Blob) return photo.blob;
      const downloadProvider = resolveProvider(photo?.cloud?.provider);
      if (!photo?.cloud || photo.cloud.state !== PHOTO_CLOUD_STATE.SYNCED
        || !downloadProvider || !photo.cloud.objectKey || !photo.cloud.sha256
        || !isActive(getCurrentOwnerId, ownerId)) return null;
      const blob = await downloadProvider.download({
        ownerId,
        catchId,
        photoId: photo.id,
        objectKey: photo.cloud.objectKey,
        sha256: photo.cloud.sha256,
        requestDownloadGrant: (photo) => authenticatedRequest("/api/cloudinary/delivery", photo),
      });
      if (!(blob instanceof Blob)) return null;
      if (blob.size !== photo.size || (photo.type && blob.type !== photo.type)
        || await sha256Blob(blob) !== photo.cloud.sha256) {
        throw new Error("Stažená fotografie neodpovídá uloženým metadatům.");
      }
      if (!isActive(getCurrentOwnerId, ownerId)) return null;
      const cached = await catches.cachePhotoBlob(catchId, photo.id, blob, scope);
      return cached instanceof Blob ? cached : blob;
    },
  });
}

export function getPhotoBlobForDisplay(options) {
  return createPhotoCloudService({
    provider: getPhotoCloudProvider(),
    getCurrentOwnerId: () => {
      try { return firebaseAuth.currentUserId(); } catch { return null; }
    },
  }).getPhotoBlob(options);
}
