import { catchRepository, photoCloudOutboxRepository } from "./catchRepository.js";
import { readPhotoBlob } from "./photoLocalBlob.js";

function safeErrorClass(value) {
  return typeof value === "string" && /^[a-z0-9_:-]{1,64}$/i.test(value) ? value : "unknown";
}

/** Return per-photo diagnostics without identifiers, content, URLs, or credentials. */
export async function readPhotoSyncDiagnostics({
  scope,
  catches = catchRepository,
  queue = photoCloudOutboxRepository,
} = {}) {
  if (!scope?.scopeKey) return [];
  const records = await catches.list(scope);
  const jobs = scope.ownerId ? await queue.list() : [];
  const jobsByPhoto = new Map(jobs
    .filter((job) => job.scopeKey === scope.scopeKey)
    .map((job) => [`${job.photoCloud?.catchId}/${job.photoCloud?.photoId}`, job]));
  return (await Promise.all(records.flatMap((record) => (record.photos ?? []).map(async (photo) => {
    const job = jobsByPhoto.get(`${record.id}/${photo.id}`);
    const hasBlob = photo.blob instanceof Blob;
    let localBlobReadable = hasBlob ? false : null;
    let errorName = photo.localError?.errorName ?? null;
    let errorStage = photo.localError?.stage ?? null;
    if (hasBlob) {
      try { await readPhotoBlob(photo.blob, "photo-diagnostics-read-local-blob"); localBlobReadable = true; }
      catch (error) { errorName = error.name; errorStage = error.photoStage; }
    }
    return {
      blobPresent: hasBlob,
      localBlobReadable,
      size: hasBlob ? photo.blob.size : Number.isFinite(photo.size) ? photo.size : null,
      type: String(photo.blob?.type || photo.type || "unknown").slice(0, 64),
      jobState: job?.photoCloud?.state ?? job?.status ?? (photo.cloud?.state === "synced" ? "synced" : "no_job"),
      attempts: Number.isSafeInteger(job?.attemptCount) ? job.attemptCount : 0,
      nextRetryAt: typeof job?.nextAttemptAt === "string" ? job.nextAttemptAt : null,
      errorClass: job?.lastErrorCode ? safeErrorClass(job.lastErrorCode)
        : job?.lastProviderCode ? safeErrorClass(job.lastProviderCode) : photo.localError?.code ? safeErrorClass(photo.localError.code)
          : errorName === "NotFoundError" ? "photo_local_blob_unreadable" : "none",
      errorName,
      errorStage,
      cloudState: safeErrorClass(photo.cloud?.state ?? "localOnly"),
      remoteAvailability: "unknown",
    };
  })))).flat();
}
