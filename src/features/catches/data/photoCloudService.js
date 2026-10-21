import { accountScopeKey, validateDataScope } from "../../auth/data/localDataScope.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { catchRepository, outboxRepository, photoCloudOutboxRepository } from "./catchRepository.js";
import { preparePhotoForStorageAndUpload } from "./photoInput.js";
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

const TERMINAL_UPLOAD_ERRORS = new Set(["photo_blob_missing", "photo_content_mismatch", "invalid_photo", "invalid_photo_identity"]);

function safePhotoCloud(photo) {
  return photo?.cloud ?? { state: PHOTO_CLOUD_STATE.LOCAL_ONLY, provider: null, objectKey: null, sha256: null };
}

async function normalizeLegacyPhotoIds(catches, ownerId, now, normalizeLegacyPhoto = preparePhotoForStorageAndUpload) {
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  const records = await catches.list(scope);
  let normalized = 0;
  for (const record of records) {
    const used = new Set();
    let changed = false;
    let photos = (record.photos ?? []).map((photo) => {
      const valid = typeof photo.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(photo.id);
      if (valid && !used.has(photo.id)) { used.add(photo.id); return photo; }
      if (!(photo.blob instanceof Blob)) return photo;
      if (!globalThis.crypto?.randomUUID) throw new Error("Toto zařízení neumí bezpečně vytvořit ID starší fotografie.");
      let id;
      do { id = globalThis.crypto.randomUUID(); } while (used.has(id));
      used.add(id);
      changed = true;
      normalized += 1;
      return { ...photo, id };
    });
    const primaryPhotoId = photos.some((photo) => photo.id === record.primaryPhotoId) ? record.primaryPhotoId : photos[0]?.id ?? null;
    if (primaryPhotoId !== record.primaryPhotoId) changed = true;
    const normalizedPhotos = [];
    for (const photo of photos) {
      const type = photo.blob?.type || photo.type || "";
      if (!(photo.blob instanceof Blob) || ["image/jpeg", "image/png", "image/webp"].includes(type)) {
        normalizedPhotos.push(photo);
        continue;
      }
      try {
        const prepared = await normalizeLegacyPhoto(photo.blob, { fileName: photo.name });
        const blob = prepared instanceof Blob ? prepared : prepared?.blob;
        if (!(blob instanceof Blob)) throw new TypeError("Příprava legacy fotografie nevrátila Blob.");
        normalizedPhotos.push({ ...photo, blob, type: "image/jpeg", size: blob.size,
          contentSha256: prepared.sha256 ?? await sha256Blob(blob),
          name: String(photo.name || "fotografie").replace(/\.[^.]+$/, ".jpg"),
          cloud: { state: PHOTO_CLOUD_STATE.LOCAL_ONLY, provider: null, objectKey: null, sha256: null } });
        changed = true;
      } catch {
        // Retain the original bytes. The regular upload path reports a retryable error without deleting them.
        normalizedPhotos.push(photo);
      }
    }
    photos = normalizedPhotos;
    if (changed) await catches.put({ ...record, photos, primaryPhotoId, updatedAt: new Date(now()).toISOString(),
      sync: { ...(record.sync ?? {}), status: "local", revision: (record.sync?.revision ?? 0) + 1 } }, scope);
  }
  return normalized;
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
  isCatchMetadataSynced = async (ownerId, catchId) => {
    const record = await catches.get(catchId, { ownerId, scopeKey: accountScopeKey(ownerId) });
    if (record?.sync?.status !== "metadata-synced") return false;
    const operations = await operationOutbox.list();
    return !operations.some((item) => item.ownerId === ownerId && item.entityType === "catch" && item.entityId === catchId);
  },
  now = () => Date.now(),
  prepare = (photo) => preparePhotoForCloud(photo),
  normalizeLegacyPhoto = preparePhotoForStorageAndUpload,
  authenticatedRequest = callAuthenticatedPhotoEndpoint,
} = {}) {
  let inFlight = null;
  let rerunRequested = false;
  let rerunForce = false;
  let rerunOwnerId = null;
  let preflightOwnerId = null;

  async function prepareLegacyPhotoIds(ownerId) {
    const result = await normalizeLegacyPhotoIds(catches, ownerId, now, normalizeLegacyPhoto);
    preflightOwnerId = ownerId;
    return result;
  }

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
        if (cloud.state === PHOTO_CLOUD_STATE.UNAVAILABLE && cloud.objectKey === objectKey && cloud.sha256 === sha256) continue;
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
    if (!await isCatchMetadataSynced(job.ownerId, job.catchId)) {
      return { uploaded: 0, deleted: 0, deferred: true };
    }
    const catchRecord = await catches.get(job.catchId, scope);
    const photo = catchRecord?.photos?.find((item) => item.id === job.photoId);
    if (!(photo?.blob instanceof Blob)) {
      if (photo?.cloud?.state === PHOTO_CLOUD_STATE.SYNCED && photo.cloud.provider === job.provider
        && photo.cloud.objectKey === job.objectKey && photo.cloud.sha256 === job.sha256) {
        await queue.complete(operation.operationId, operation.localRevision);
        return { uploaded: 0, deleted: 0 };
      }
      throw Object.assign(new Error("Lokální data fotografie už nejsou dostupná."), { code: "photo_blob_missing" });
    }
    const stage = async (value) => {
      if (!await queue.setStage(operation.operationId, operation.localRevision, value)) {
        throw Object.assign(new Error("Photo upload job byl mezitím nahrazen novější verzí."), { code: "photo_job_superseded" });
      }
    };
    await stage("preparing");
    if (await sha256Blob(photo.blob) !== job.sha256) throw Object.assign(new Error("Lokální data fotografie neodpovídají upload jobu."), { code: "photo_content_mismatch" });
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
      onStage: stage,
      requestUploadGrant: (photo) => authenticatedRequest("/api/cloudinary/sign", photo),
      requestUploadVerification: (photo) => authenticatedRequest("/api/cloudinary/verify-upload", photo),
    });
    if (!isActive(getCurrentOwnerId, operation.ownerId)) return { uploaded: 0, deleted: 0, stopped: true };
    if (!await queue.isCurrent(operation.operationId, operation.localRevision)) return { uploaded: 1, deleted: 0 };
    await stage("persisting");
    const saved = await saveSyncedPhotoMetadata(job, {
      state: PHOTO_CLOUD_STATE.SYNCED,
      provider: provider.id,
      objectKey: job.objectKey,
      sha256: job.sha256,
    });
    if (!saved) throw new Error("Cloudinary upload proběhl, ale metadata fotografie se nepodařilo potvrdit místně.");
    await queue.complete(operation.operationId, operation.localRevision);
    return { uploaded: 1, deleted: 0 };
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
    if (preflightOwnerId !== ownerId) await prepareLegacyPhotoIds(ownerId);
    preflightOwnerId = null;
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
        if (failure?.code === "photo_job_superseded") continue;
        error = failure;
        const job = operation.photoCloud;
        const terminal = operation.operation === "photo-upload" && TERMINAL_UPLOAD_ERRORS.has(failure?.code);
        if (terminal) await operationOutbox.markConflict(operation.operationId, failure?.message, failure.code);
        else await operationOutbox.markFailed(operation.operationId, failure?.message, {
          code: failure?.code,
          providerCode: failure?.providerCode,
          endpoint: failure?.endpoint,
        });
        if (operation.operation === "photo-upload") {
          const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
          const latest = terminal ? await catches.get(job.catchId, scope).catch(() => null) : null;
          const latestPhoto = latest?.photos?.find((photo) => photo.id === job.photoId);
          if (!terminal || latestPhoto?.cloud?.state !== PHOTO_CLOUD_STATE.SYNCED) {
            await catches.setPhotoCloudState(job.catchId, job.photoId, {
              state: terminal ? PHOTO_CLOUD_STATE.UNAVAILABLE : PHOTO_CLOUD_STATE.UPLOAD_FAILED,
              provider: job.provider,
              objectKey: job.objectKey,
              sha256: job.sha256,
              ...(terminal ? { errorCode: failure.code } : {}),
            }, scope).catch(() => {});
          }
        }
        break;
      }
    }
    return { status: error ? "error" : "success", uploaded, deleted, queued, error: error?.message ?? "",
      errorCode: error?.code ?? "photo_cloud_failed", errorEndpoint: error?.endpoint ?? "" };
  }

  return Object.freeze({
    normalizeLegacyPhotoIds: prepareLegacyPhotoIds,
    run(ownerId, options) {
      if (inFlight) {
        rerunRequested = true;
        rerunForce = rerunForce || Boolean(options?.force);
        rerunOwnerId = ownerId;
        return inFlight;
      }
      inFlight = (async () => {
        let activeOwnerId = ownerId;
        let activeForce = Boolean(options?.force);
        let result;
        do {
          rerunRequested = false;
          rerunForce = false;
          rerunOwnerId = null;
          result = await runOnce(activeOwnerId, { force: activeForce });
          if (rerunRequested) {
            activeOwnerId = rerunOwnerId;
            activeForce = rerunForce;
          }
        } while (rerunRequested && isActive(getCurrentOwnerId, activeOwnerId));
        return result;
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
    async getPhotoBlob({ photo, ownerId, catchId, scopeKey }) {
      const scope = validateDataScope({ scopeKey, ownerId });
      if (!isActive(getCurrentOwnerId, ownerId)) return null;
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
      if (!(blob instanceof Blob)) {
        if (blob === null) throw Object.assign(new Error("Cloudinary asset is missing."), { code: "cloudinary_asset_missing" });
        return null;
      }
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
