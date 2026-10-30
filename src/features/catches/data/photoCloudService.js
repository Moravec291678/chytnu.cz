import { accountScopeKey, validateDataScope } from "../../auth/data/localDataScope.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { catchRepository, outboxRepository, photoCloudOutboxRepository } from "./catchRepository.js";
import { recordPhotoUploadTrace } from "./photoUploadTrace.js";
import { PHOTO_LOCAL_BLOB_UNREADABLE, photoBlobErrorCode } from "./photoLocalBlob.js";
import { preparePhotoForStorageAndUpload } from "./photoInput.js";
import { resolveApiUrl } from "../../../platform/api.js";
import {
  createPhotoObjectKey,
  getPhotoCloudProvider,
  isPhotoCloudReady,
  nonePhotoCloudProvider,
  PHOTO_CLOUD_STATE,
  preparePhotoForCloud,
  sha256Blob,
} from "./photoCloudProvider.js";

function due(operation, now, force) {
  if (operation.status === "conflict") return force && operation.lastErrorCode === PHOTO_LOCAL_BLOB_UNREADABLE;
  if (operation.status !== "failed") return true;
  return force || !operation.nextAttemptAt || Date.parse(operation.nextAttemptAt) <= now;
}

function isActive(getCurrentOwnerId, ownerId) {
  return getCurrentOwnerId() === ownerId;
}

const TERMINAL_UPLOAD_ERRORS = new Set(["photo_blob_missing", "photo_content_mismatch", "invalid_photo", "invalid_photo_identity", PHOTO_LOCAL_BLOB_UNREADABLE]);

function safePhotoCloud(photo) {
  return photo?.cloud ?? { state: PHOTO_CLOUD_STATE.LOCAL_ONLY, provider: null, objectKey: null, sha256: null };
}

async function acknowledgeNativeUpload(provider, operationId) {
  try { await provider.acknowledgeUpload?.({ operationId }); } catch { /* Durable local outbox remains the recovery source. */ }
}

async function normalizeLegacyPhotoIds(catches, ownerId, now, normalizeLegacyPhoto = preparePhotoForStorageAndUpload, { force = false } = {}) {
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
      if (photo.uploadReady === false && !force) {
        normalizedPhotos.push(photo);
        continue;
      }
      if (!(photo.blob instanceof Blob) || (photo.uploadReady !== false && ["image/jpeg", "image/png", "image/webp"].includes(type))) {
        normalizedPhotos.push(photo);
        continue;
      }
      try {
        const prepared = await normalizeLegacyPhoto(photo.blob, { fileName: photo.name });
        const blob = prepared instanceof Blob ? prepared : prepared?.blob;
        if (!(blob instanceof Blob)) throw new TypeError("Příprava legacy fotografie nevrátila Blob.");
        if (prepared?.uploadReady === false) throw new Error("Fotografii nelze připravit pro upload.");
        normalizedPhotos.push({ ...photo, blob, type: blob.type || "image/jpeg", size: blob.size,
          contentSha256: prepared.sha256 ?? await sha256Blob(blob), uploadReady: true,
          name: prepared.name || String(photo.name || "fotografie").replace(/\.[^.]+$/, ".jpg"),
          cloud: { state: PHOTO_CLOUD_STATE.LOCAL_ONLY, provider: null, objectKey: null, sha256: null } });
        changed = true;
      } catch {
        // Preserve original bytes; reconciliation creates a visible, recoverable failed job.
        normalizedPhotos.push({ ...photo, uploadReady: false,
          cloud: { state: PHOTO_CLOUD_STATE.UNAVAILABLE, provider: null, objectKey: null, sha256: null } });
        changed = true;
      }
    }
    photos = normalizedPhotos;
    if (changed) await catches.put({ ...record, photos, primaryPhotoId, updatedAt: new Date(now()).toISOString(),
      sync: { ...(record.sync ?? {}), status: "local", revision: (record.sync?.revision ?? 0) + 1 } }, scope);
  }
  return normalized;
}

function photoEndpointError(path, response, result) {
  const code = result.error === "photo_not_available" && result.providerStatus === 404 ? "cloudinary_asset_missing"
    : result.error === "photo_not_available" ? "photo_metadata_not_ready"
    : result.error ?? (response.status === 429 ? "rate_limited" : "photo_cloud_failed");
  const error = Object.assign(new Error(response.status === 401 ? "Přihlášení k fotografiím se nezdařilo."
    : response.status === 403 ? "K této fotografii nemáš přístup."
      : response.status === 429 ? "Cloudové úložiště dočasně omezuje požadavky."
        : response.status >= 500 ? "Server cloudových fotografií dočasně není dostupný."
          : "Cloudový požadavek na fotografii nebyl přijat."), { code, status: response.status, endpoint: path,
    ...(Number.isInteger(result.providerStatus) ? { providerStatus: result.providerStatus } : {}) });
  return error;
}

export function createAuthenticatedPhotoEndpointCaller({
  getIdToken = (forceRefresh) => firebaseAuth.currentIdToken(forceRefresh),
  fetchImpl = globalThis.fetch,
  apiUrl = resolveApiUrl,
} = {}) {
  return async function callAuthenticatedPhotoEndpoint(path, payload, { responseType = "json" } = {}) {
    let idToken;
    try { idToken = await getIdToken(false); }
    catch { throw Object.assign(new Error("Firebase přihlášení nelze ověřit."), { code: "firebase_token_invalid", endpoint: path }); }
    if (!idToken) throw Object.assign(new Error("Pro synchronizaci fotografií je potřeba přihlášení."), { code: "missing_firebase_user", endpoint: path });

    const send = async (token) => {
      let response;
      const requestUrl = apiUrl(path);
      try {
        response = await fetchImpl(requestUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        throw Object.assign(new Error("Server pro cloudové fotografie není dostupný."), { code: "photo_cloud_network_error", endpoint: path });
      }
      let result;
      if (response.ok && responseType === "blob") return { response, result: await response.blob() };
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

function safeDiagnosticCode(code) {
  return typeof code === "string" && /^[a-z0-9_:-]{1,64}$/i.test(code) ? code : "unknown";
}

/** Runs the same authenticated metadata and binary delivery checks used by the app, but never returns or logs photo bytes. */
export async function inspectPhotoDelivery({ catchId, photoId, authenticatedRequest = callAuthenticatedPhotoEndpoint, now = () => Date.now() }) {
  const timestamp = new Date(now()).toISOString();
  const result = { timestamp, metadataStatus: null, deliveryStatus: null, providerStatus: null, errorCode: null };
  try {
    await authenticatedRequest("/api/cloudinary/metadata", { catchId, photoId });
    result.metadataStatus = 200;
  } catch (error) {
    result.metadataStatus = Number.isInteger(error?.status) ? error.status : null;
    result.providerStatus = Number.isInteger(error?.providerStatus) ? error.providerStatus : null;
    result.errorCode = safeDiagnosticCode(error?.code);
  }
  try {
    await authenticatedRequest("/api/cloudinary/export", { catchId, photoId }, { responseType: "blob" });
    result.deliveryStatus = 200;
  } catch (error) {
    result.deliveryStatus = Number.isInteger(error?.status) ? error.status : null;
    result.providerStatus ??= Number.isInteger(error?.providerStatus) ? error.providerStatus : null;
    result.errorCode ??= safeDiagnosticCode(error?.code);
  }
  return result;
}

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
  isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden",
  prepare = (photo) => preparePhotoForCloud(photo),
  normalizeLegacyPhoto = preparePhotoForStorageAndUpload,
  authenticatedRequest = callAuthenticatedPhotoEndpoint,
  onPhotoReady = async () => {},
} = {}) {
  let inFlight = null;
  let rerunRequested = false;
  let rerunForce = false;
  let rerunOwnerId = null;
  let preflightOwnerId = null;
  const photoMetadataWriteLocks = new Map();

  async function prepareLegacyPhotoIds(ownerId, options = {}) {
    const result = await normalizeLegacyPhotoIds(catches, ownerId, now, normalizeLegacyPhoto, options);
    preflightOwnerId = ownerId;
    return result;
  }

  async function withPhotoMetadataWriteLock(ownerId, catchId, action) {
    const lockKey = `${ownerId}:${catchId}`;
    const previous = photoMetadataWriteLocks.get(lockKey) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    photoMetadataWriteLocks.set(lockKey, current);
    await previous;
    try { return await action(); }
    finally {
      release();
      if (photoMetadataWriteLocks.get(lockKey) === current) photoMetadataWriteLocks.delete(lockKey);
    }
  }

  async function reconcileUploads(ownerId, { force = false } = {}) {
    if (provider.id === "none") return { queued: 0, needsAttention: false };
    const existingJobs = await queue.list();
    const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
    const records = await catches.list(scope);
    let queued = 0;
    let needsAttention = false;
    for (const record of records) {
      if (!isActive(getCurrentOwnerId, ownerId)) return queued;
      for (const photo of record.photos ?? []) {
        if (!(photo.blob instanceof Blob)) continue;
        if (photo.localError?.code === PHOTO_LOCAL_BLOB_UNREADABLE && !force) continue;
        let sha256;
        try {
          sha256 = await sha256Blob(photo.blob);
          if (photo.localError && catches.setPhotoLocalError) await catches.setPhotoLocalError(record.id, photo.id, null, scope);
        } catch (failure) {
          if (photoBlobErrorCode(failure) !== PHOTO_LOCAL_BLOB_UNREADABLE) throw failure;
          recordPhotoUploadTrace(photo.id, "local_blob_failure", { errorCode: PHOTO_LOCAL_BLOB_UNREADABLE,
            errorName: failure.name, operationStage: failure.photoStage || "photo-hash-local-blob", retryable: false });
          await catches.setPhotoLocalError?.(record.id, photo.id, { code: PHOTO_LOCAL_BLOB_UNREADABLE,
            errorName: failure.name, stage: failure.photoStage || "photo-hash-local-blob" }, scope).catch(() => {});
          if (safePhotoCloud(photo).state !== PHOTO_CLOUD_STATE.SYNCED) {
            needsAttention = true;
            await catches.setPhotoCloudState(record.id, photo.id, { state: PHOTO_CLOUD_STATE.UNAVAILABLE,
              provider: null, objectKey: null, sha256: null }, scope).catch(() => {});
          }
          continue;
        }
        const objectKey = createPhotoObjectKey(ownerId, record.id, photo.id);
        const cloud = safePhotoCloud(photo);
        if (photo.uploadReady !== false && cloud.state === PHOTO_CLOUD_STATE.UNAVAILABLE && cloud.objectKey === objectKey && cloud.sha256 === sha256) continue;
        if (isPhotoCloudReady(photo, { provider: provider.id, objectKey, sha256 })) continue;
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
        const sameJob = existingJobs.some((entry) => entry.ownerId === ownerId && entry.operation === "photo-upload"
          && entry.photoCloud?.objectKey === objectKey && entry.photoCloud?.sha256 === sha256);
        if (accepted && !sameJob) {
          queued += 1;
          recordPhotoUploadTrace(photo.id, "job_created", { bytes: photo.blob.size, mimeType: photo.blob.type, uploadReady: photo.uploadReady !== false });
          recordPhotoUploadTrace(photo.id, "photo_queued", { bytes: photo.blob.size, mimeType: photo.blob.type });
        }
        if (sameJob && cloud.state === PHOTO_CLOUD_STATE.UPLOAD_FAILED) continue;
        await catches.setPhotoCloudState(record.id, photo.id, {
          state: PHOTO_CLOUD_STATE.PENDING_UPLOAD,
          provider: provider.id,
          objectKey,
          sha256,
        }, scope);
      }
    }
    return { queued, needsAttention };
  }

  async function saveSyncedPhotoMetadata(job, photoCloud, { recovered = false } = {}) {
    return withPhotoMetadataWriteLock(job.ownerId, job.catchId, async () => {
      const scope = { ownerId: job.ownerId, scopeKey: accountScopeKey(job.ownerId) };
      const record = await catches.get(job.catchId, scope);
      if (!record) return false;
      const photo = (record.photos ?? []).find((item) => item.id === job.photoId);
      if (!photo || (recovered
        ? photo.cloud?.sha256 && photo.cloud.sha256 !== job.sha256
        : !(photo.blob instanceof Blob) || await sha256Blob(photo.blob) !== job.sha256)) return false;
      const photos = record.photos.map((item) => item.id === job.photoId ? { ...item, cloud: photoCloud } : item);
      await catches.put({
        ...record,
        photos,
        updatedAt: new Date(now()).toISOString(),
        sync: { ...(record.sync ?? {}), status: "local", revision: (record.sync?.revision ?? 0) + 1 },
      }, scope);
      return true;
    });
  }

  async function processUpload(operation) {
    const job = operation.photoCloud;
    const scope = { ownerId: operation.ownerId, scopeKey: operation.scopeKey };
    const catchRecord = await catches.get(job.catchId, scope);
    const photo = catchRecord?.photos?.find((item) => item.id === job.photoId);
    if (isPhotoCloudReady(photo, job)) {

      await queue.complete(operation.operationId, operation.localRevision);
      return { uploaded: 0, deleted: 0 };
    }
    if (!await isCatchMetadataSynced(job.ownerId, job.catchId)) {
      return { uploaded: 0, deleted: 0, deferred: true };
    }
    if (!photo) throw Object.assign(new Error("Lokální data fotografie už nejsou dostupná."), { code: "photo_blob_missing" });
    const previousStage = operation.photoCloud?.state;
    const nativeStatus = await provider.getUploadStatus?.({ operationId: operation.operationId });
    if (["queued", "uploading"].includes(nativeStatus?.state)) return { uploaded: 0, deleted: 0, deferred: true };
    const stage = async (value) => {
      if (!await queue.setStage(operation.operationId, operation.localRevision, value)) {
        throw Object.assign(new Error("Photo upload job byl mezitím nahrazen novější verzí."), { code: "photo_job_superseded" });
      }
      const diagnosticStage = ({ preparing: "photo_preparing", signing: "sign_started", uploading: "cloud_upload_started",
        verifying: "photo_verifying", persisting: "photo_persisting" })[value];
      if (diagnosticStage) recordPhotoUploadTrace(job.photoId, diagnosticStage, { bytes: job.size, mimeType: job.contentType });
    };
    let localBlobError = null;
    if (photo.blob instanceof Blob) {
      try {
        if (await sha256Blob(photo.blob) !== job.sha256) throw Object.assign(new Error("Lokální data fotografie neodpovídají upload jobu."), { code: "photo_content_mismatch" });
      } catch (error) {
        if (photoBlobErrorCode(error) !== PHOTO_LOCAL_BLOB_UNREADABLE) throw error;
        localBlobError = error;
      }
    } else localBlobError = Object.assign(new Error("Lokální data fotografie už nejsou dostupná."), { code: "photo_blob_missing" });
    if (photo.uploadReady === false) throw Object.assign(new Error("Fotografii se nepodařilo převést. Zkus znovu synchronizovat, nebo vyber fotografii z Photos znovu."), { code: "photo_prepare_failed" });
    const shouldRecover = operation.status === "failed" || ["uploading", "verifying", "persisting"].includes(previousStage);
    if (shouldRecover && typeof provider.recoverUpload === "function") {
      const recovered = await provider.recoverUpload({ ...job, requestUploadVerification: (payload) => authenticatedRequest("/api/cloudinary/verify-upload", payload) });
      if (recovered) {
        if (!isActive(getCurrentOwnerId, operation.ownerId)) return { uploaded: 0, deleted: 0, stopped: true };
        if (!await queue.isCurrent(operation.operationId, operation.localRevision)) return { uploaded: 0, deleted: 0 };
        const saved = await saveSyncedPhotoMetadata(job, { state: PHOTO_CLOUD_STATE.SYNCED, provider: job.provider,
          objectKey: job.objectKey, sha256: job.sha256 }, { recovered: true });
        if (!saved) throw new Error("Cloudová fotografie byla ověřena, ale místní metadata se nepodařilo uložit.");
        await queue.complete(operation.operationId, operation.localRevision);

        recordPhotoUploadTrace(job.photoId, "photo_synced", { bytes: job.size, mimeType: job.contentType });
        await onPhotoReady(job).catch(() => {});
        return { uploaded: 1, deleted: 0 };
      }
    }
    if (localBlobError) throw localBlobError;
    await stage("preparing");
    const prepared = await prepare(photo);
    const blob = prepared.original;
    const actualHash = await sha256Blob(blob);
    if (actualHash !== job.sha256) throw new Error("Příprava fotografie změnila její originální bytes.");
    const requestEndpoint = async (path, payload, label) => {
      recordPhotoUploadTrace(job.photoId, `${label}_started`);
      try {
        const result = await authenticatedRequest(path, payload);
        recordPhotoUploadTrace(job.photoId, `${label}_pass`, { httpStatus: 200 });
        return result;
      } catch (error) {
        recordPhotoUploadTrace(job.photoId, `${label}_fail`, { errorCode: error?.code, httpStatus: error?.status });
        throw error;
      }
    };
    await provider.upload({
      operationId: operation.operationId,
      ownerId: job.ownerId,
      catchId: job.catchId,
      photoId: job.photoId,
      blob,
      objectKey: job.objectKey,
      sha256: job.sha256,
      contentType: job.contentType,
      size: job.size,
      onStage: stage,
      onDiagnostic: (stage, details) => recordPhotoUploadTrace(job.photoId, stage, details),
      requestUploadGrant: (photo) => requestEndpoint("/api/cloudinary/sign", photo, "sign"),
      requestUploadVerification: (photo) => requestEndpoint("/api/cloudinary/verify-upload", photo, "verify"),
    });
    recordPhotoUploadTrace(job.photoId, "photo_uploaded", { bytes: job.size, mimeType: job.contentType });
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
    recordPhotoUploadTrace(job.photoId, "local_metadata_persisted");
    await queue.complete(operation.operationId, operation.localRevision);

    recordPhotoUploadTrace(job.photoId, "photo_synced", { bytes: job.size, mimeType: job.contentType });
    await onPhotoReady(job).catch(() => {});
    return { uploaded: 1, deleted: 0 };
  }

  async function processDelete(operation) {
    const job = operation.photoCloud;
    await provider.cancelUploadsForPhoto?.({ ownerId: job.ownerId, catchId: job.catchId, photoId: job.photoId });
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
    if (!isVisible()) return { status: "deferred", uploaded: 0, deleted: 0, queued: 0 };
    if (preflightOwnerId !== ownerId) await prepareLegacyPhotoIds(ownerId, { force });
    preflightOwnerId = null;
    const reconciliation = await reconcileUploads(ownerId, { force });
    const queued = reconciliation.queued;
    if (!await provider.isAvailable({ ownerId })) return { status: "local-only", uploaded: 0, deleted: 0, queued };
    try { await provider.reconcileUploads?.(); } catch { /* Firestore outbox reconciliation can still recover interrupted native uploads. */ }
    let needsAttention = reconciliation.needsAttention;
    let uploaded = 0;
    let deleted = 0;
    let error = null;
    const operations = await queue.list();
    let nextOperationIndex = 0;
    let stopScheduling = false;
    const processNextOperation = async () => {
      while (!stopScheduling && isVisible() && isActive(getCurrentOwnerId, ownerId)) {
        const operation = operations[nextOperationIndex++];
        if (!operation) return;
        if (operation.ownerId !== ownerId || !due(operation, now(), force)) continue;
      try {
        const result = operation.operation === "photo-upload"
          ? await processUpload(operation)
          : operation.operation === "photo-delete"
            ? await processDelete(operation)
            : null;
        uploaded += result?.uploaded ?? 0;
        deleted += result?.deleted ?? 0;
        if (result?.stopped) { stopScheduling = true; return; }
      } catch (failure) {
        if (failure?.code === "photo_job_superseded") continue;
        error ??= failure;
        const job = operation.photoCloud;
        const localBlobUnreadable = photoBlobErrorCode(failure) === PHOTO_LOCAL_BLOB_UNREADABLE;
        const failureCode = localBlobUnreadable ? PHOTO_LOCAL_BLOB_UNREADABLE : failure?.code;
        recordPhotoUploadTrace(operation.photoCloud.photoId, "upload_fail", { errorCode: failureCode, httpStatus: failure?.status,
          retryable: failureCode !== "photo_prepare_failed" && !TERMINAL_UPLOAD_ERRORS.has(failureCode),
          errorName: failure?.name, operationStage: failure?.photoStage || "photo-upload" });
        const terminal = operation.operation === "photo-upload" && (TERMINAL_UPLOAD_ERRORS.has(failure?.code) || localBlobUnreadable);
        if (terminal) await operationOutbox.markConflict(operation.operationId, failure?.message, failureCode);
        else await operationOutbox.markFailed(operation.operationId, failure?.message, {
          code: failureCode,
          providerCode: failure?.providerCode,
          endpoint: failure?.endpoint,
        });
        if (operation.operation === "photo-upload") {
          const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
          await withPhotoMetadataWriteLock(ownerId, job.catchId, async () => {
            const latest = terminal ? await catches.get(job.catchId, scope).catch(() => null) : null;
            const latestPhoto = latest?.photos?.find((photo) => photo.id === job.photoId);
            if (!terminal || latestPhoto?.cloud?.state !== PHOTO_CLOUD_STATE.SYNCED) {
              await catches.setPhotoCloudState(job.catchId, job.photoId, {
                state: terminal ? PHOTO_CLOUD_STATE.UNAVAILABLE : PHOTO_CLOUD_STATE.UPLOAD_FAILED,
                provider: job.provider,
                objectKey: job.objectKey,
                sha256: job.sha256,
                ...(terminal ? { errorCode: failureCode } : {}),
              }, scope).catch(() => {});
            }
            if (localBlobUnreadable) await catches.setPhotoLocalError?.(job.catchId, job.photoId, {
              code: PHOTO_LOCAL_BLOB_UNREADABLE, errorName: failure.name,
              stage: failure.photoStage || "photo-hash-local-blob" }, scope).catch(() => {});
          });
        }
        if (failure?.code !== "photo_prepare_failed" && !localBlobUnreadable) { stopScheduling = true; return; }
      }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, operations.length) }, () => processNextOperation()));
    needsAttention ||= Boolean(error && photoBlobErrorCode(error) === PHOTO_LOCAL_BLOB_UNREADABLE);
    return { status: error && !needsAttention ? "error" : needsAttention ? "partial" : isVisible() ? "success" : "deferred", uploaded, deleted, queued,
      needsAttention: Boolean(needsAttention), error: error?.message ?? "",
      errorCode: needsAttention && photoBlobErrorCode(error) !== PHOTO_LOCAL_BLOB_UNREADABLE ? PHOTO_LOCAL_BLOB_UNREADABLE
        : photoBlobErrorCode(error) === PHOTO_LOCAL_BLOB_UNREADABLE ? PHOTO_LOCAL_BLOB_UNREADABLE : error?.code ?? "photo_cloud_failed",
      errorEndpoint: error?.endpoint ?? "" };
  }

  return Object.freeze({
    normalizeLegacyPhotoIds: prepareLegacyPhotoIds,
    async finalizeNativeUploads(ownerId) {
      if (!isActive(getCurrentOwnerId, ownerId)) return;
      const pending = await operationOutbox.list();
      const native = await provider.listPendingUploads?.() ?? [];
      for (const upload of native) {
        if (upload.ownerId !== ownerId || pending.some((item) => item.ownerId === ownerId
          && item.entityId === upload.catchId)) continue;
        const record = await catches.get(upload.catchId, { ownerId, scopeKey: accountScopeKey(ownerId) });
        const photo = record?.photos?.find((item) => item.id === upload.photoId);
        if (record?.sync?.status === "metadata-synced" && isPhotoCloudReady(photo)
          && photo.cloud.sha256 === upload.sha256 && isActive(getCurrentOwnerId, ownerId)) {
          await acknowledgeNativeUpload(provider, upload.operationId);
        }
      }
    },
    async reconcileLocalQueue(ownerId, options = {}) {
      if (!ownerId || !isActive(getCurrentOwnerId, ownerId)) return { queued: 0, needsAttention: false };
      if (preflightOwnerId !== ownerId) await prepareLegacyPhotoIds(ownerId, options);
      preflightOwnerId = null;
      return reconcileUploads(ownerId, options);
    },
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
      let localBlobError = null;
      if (photo?.blob instanceof Blob) {
        try {
          await photo.blob.arrayBuffer();
          if (photo.cloud?.state === PHOTO_CLOUD_STATE.SYNCED && photo.cloud.sha256
            && await sha256Blob(photo.blob) !== photo.cloud.sha256) {
            localBlobError = Object.assign(new Error("Místní fotografie neodpovídá ověřené cloudové kopii."), {
              code: "photo_local_blob_hash_mismatch", photoStage: "photo-verify-local-blob",
            });
          } else return photo.blob;
        }
        catch (failure) {
          localBlobError = failure;
        }
        const localErrorCode = photoBlobErrorCode(localBlobError) === PHOTO_LOCAL_BLOB_UNREADABLE
          ? PHOTO_LOCAL_BLOB_UNREADABLE : "photo_local_blob_hash_mismatch";
        const operationStage = localBlobError.photoStage || "photo-read-local-blob";
        recordPhotoUploadTrace(photo.id, "local_blob_failure", { errorCode: localErrorCode,
          errorName: localBlobError.name, operationStage, retryable: false });
        await catches.setPhotoLocalError?.(catchId, photo.id, { code: localErrorCode,
          errorName: localBlobError.name, stage: operationStage }, scope).catch(() => {});
      }
      const downloadProvider = resolveProvider(photo?.cloud?.provider);
      if (!photo?.cloud || photo.cloud.state !== PHOTO_CLOUD_STATE.SYNCED
        || !downloadProvider || !photo.cloud.objectKey || !photo.cloud.sha256
        || !isActive(getCurrentOwnerId, ownerId)) {
        if (localBlobError) {
          if (photoBlobErrorCode(localBlobError) === PHOTO_LOCAL_BLOB_UNREADABLE) {
            throw Object.assign(localBlobError, { photoErrorCode: PHOTO_LOCAL_BLOB_UNREADABLE, photoStage: "photo-read-local-blob" });
          }
          throw localBlobError;
        }
        return null;
      }
      const deliveryStart = globalThis.performance?.now?.() ?? Date.now();
      recordPhotoUploadTrace(photo.id, "photo_delivery_started", { catchId, bytes: photo.size, mimeType: photo.type });
      let blob;
      try {
        blob = await downloadProvider.download({
          ownerId,
          catchId,
          photoId: photo.id,
          objectKey: photo.cloud.objectKey,
          sha256: photo.cloud.sha256,
          requestPhotoDownload: (photo) => authenticatedRequest("/api/cloudinary/export", photo, { responseType: "blob" }),
          requestDownloadGrant: (photo) => authenticatedRequest("/api/cloudinary/delivery", photo),
        });
      } catch (error) {
        recordPhotoUploadTrace(photo.id, "photo_delivery_fail", { catchId, bytes: photo.size, mimeType: photo.type,
          durationMs: (globalThis.performance?.now?.() ?? Date.now()) - deliveryStart,
          httpStatus: error?.status, providerStatus: error?.providerStatus, errorCode: error?.code });
        throw error;
      }
      recordPhotoUploadTrace(photo.id, "photo_delivery_pass", { catchId, bytes: blob?.size ?? 0, mimeType: photo.type,
        durationMs: (globalThis.performance?.now?.() ?? Date.now()) - deliveryStart, httpStatus: 200 });
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
      await catches.setPhotoLocalError?.(catchId, photo.id, null, scope);
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
