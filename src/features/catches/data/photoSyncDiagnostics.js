import { catchRepository, photoCloudOutboxRepository } from "./catchRepository.js";

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
  return records.flatMap((record) => (record.photos ?? []).map((photo) => {
    const job = jobsByPhoto.get(`${record.id}/${photo.id}`);
    const hasBlob = photo.blob instanceof Blob;
    return {
      blobPresent: hasBlob,
      size: hasBlob ? photo.blob.size : Number.isFinite(photo.size) ? photo.size : null,
      type: String(photo.blob?.type || photo.type || "unknown").slice(0, 64),
      jobState: job?.photoCloud?.state ?? job?.status ?? (photo.cloud?.state === "synced" ? "synced" : "no_job"),
      attempts: Number.isSafeInteger(job?.attemptCount) ? job.attemptCount : 0,
      nextRetryAt: typeof job?.nextAttemptAt === "string" ? job.nextAttemptAt : null,
      errorClass: job?.lastErrorCode ? safeErrorClass(job.lastErrorCode)
        : job?.lastProviderCode ? safeErrorClass(job.lastProviderCode) : "none",
      cloudState: safeErrorClass(photo.cloud?.state ?? "localOnly"),
      remoteAvailability: "unknown",
    };
  }));
}
