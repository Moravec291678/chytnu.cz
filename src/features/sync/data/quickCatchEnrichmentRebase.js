import { mergeQuickCatchEnrichment } from "../../catches/data/quickCatchEnrichment.js";
import { ENVIRONMENT_FIELDS } from "../../catches/data/catchEnvironment.js";

const SOURCES = new Set(["device", "exif", "gps", "weather_api", "derived"]);
const CONDITION_FIELDS = ["airTempC", "pressureHpa", "windKmh"];
const validJob = (job) => job && ["pending", "complete", "unavailable", "failed"].includes(job.status)
  && Number.isInteger(job.attempts) && job.attempts >= 0 && job.attempts <= 3;

const remotePhotoHash = (photo) => photo.cloud?.sha256 || photo.contentSha256;
const localPhotoHash = (photo) => photo.contentSha256 || photo.cloud?.sha256;

/** Protect only the new automatic rebase path from inheriting bytes belonging to an older same-ID photo. */
export function prepareQuickCatchRebasePhotos(remote, local) {
  const byId = new Map((remote.record.photos ?? []).map((photo) => [photo.id, photo]));
  const invalidatedPhotoIds = new Set((local.photos ?? []).filter((photo) => {
    const replacement = byId.get(photo.id);
    if (!replacement) return true;
    const remoteHash = remotePhotoHash(replacement);
    const localHash = localPhotoHash(photo);
    return remoteHash && localHash ? remoteHash !== localHash
      : replacement.type !== photo.type || replacement.size !== photo.size;
  }).map((photo) => photo.id));
  const photos = (remote.record.photos ?? []).map((photo) => {
    const safe = { ...photo };
    delete safe.blob;
    if (safe.cloud?.sha256) safe.contentSha256 = safe.cloud.sha256;
    return safe;
  });
  return { remote: { ...remote, record: { ...remote.record, photos } },
    local: { ...local, photos: (local.photos ?? []).filter((photo) => !invalidatedPhotoIds.has(photo.id)) },
    invalidatedPhotoIds };
}

function samePhotoIdentity(left, right) {
  if ((left.photos?.length ?? 0) !== (right.photos?.length ?? 0)) return false;
  const byId = new Map((right.photos ?? []).map((photo) => [photo.id, photo]));
  return (left.photos ?? []).every((photo) => {
    const other = byId.get(photo.id);
    if (!other) return false;
    const hash = remotePhotoHash(photo);
    const otherHash = localPhotoHash(other);
    return !hash || !otherHash || hash === otherHash;
  });
}

function mergeJob(remote, local) {
  if (!validJob(local)) return remote;
  if (!validJob(remote)) return local;
  const rank = { pending: 0, failed: 1, unavailable: 2, complete: 3 };
  const preferred = rank[remote.status] >= rank[local.status] ? remote : local;
  return { ...preferred, attempts: Math.max(remote.attempts, local.attempts),
    nextAttemptAt: preferred.status === "pending" ? [remote.nextAttemptAt, local.nextAttemptAt].filter(Boolean).sort().at(-1) ?? null : null };
}

/** Only an explicitly automatic-only outbox operation may use this conservative remote-first merge. */
export function rebaseQuickCatchEnrichment(remote, local) {
  if (remote?.captureMode !== "quick" || local?.captureMode !== "quick" || !remote.quickCatch || !local.quickCatch
    || remote.id !== local.id || remote.ownerId !== local.ownerId) return null;
  // A replacement photograph invalidates the old photograph's automatic evidence.
  if (!samePhotoIdentity(remote, local)) return remote;
  const provenance = local.quickCatch.provenance ?? {};
  const auto = (field) => SOURCES.has(provenance[field]);
  const patch = { values: {}, provenance: {}, jobs: {} };
  if (auto("caughtAt") && provenance.caughtAt === "exif") {
    patch.values.caughtAt = local.caughtAt;
    patch.provenance.caughtAt = "exif";
  }
  if (auto("coordinates") && ["gps", "exif"].includes(provenance.coordinates)) {
    patch.values.coordinates = local.coordinates;
    patch.values.locationEvidence = local.locationEvidence;
    patch.provenance.coordinates = provenance.coordinates;
  }
  const withLocation = mergeQuickCatchEnrichment(remote, patch);
  const sameWeatherContext = withLocation.caughtAt === local.caughtAt
    && withLocation.coordinates?.latitude === local.coordinates?.latitude
    && withLocation.coordinates?.longitude === local.coordinates?.longitude;
  if (sameWeatherContext) {
    patch.values.environment = local.quickCatch.environment;
    for (const field of [...Object.keys(ENVIRONMENT_FIELDS), "astronomy", "weather"]) {
      if (auto(field) || field === "weather") patch.provenance[field] = field === "astronomy" ? "derived" : "weather_api";
    }
    patch.values.conditions = {};
    for (const field of CONDITION_FIELDS) {
      if (auto(field) && provenance[field] === "weather_api" && local.conditionSources?.[field] === "auto") {
        patch.values.conditions[field] = local.conditions?.[field];
        patch.provenance[field] = "weather_api";
      }
    }
  }
  for (const step of ["metadata", "weather"]) {
    if (step === "weather" && !sameWeatherContext) continue;
    const job = mergeJob(remote.quickCatch.enrichment?.[step], local.quickCatch.enrichment?.[step]);
    if (job) patch.jobs[step] = job;
  }
  return mergeQuickCatchEnrichment(remote, patch);
}

export function quickCatchAutomaticState(record) {
  // Every field that a rebase can change; excludes photos, sync and the user's fields.
  return JSON.stringify({ caughtAt: record.caughtAt, catchDateTimeSource: record.catchDateTimeSource,
    coordinates: record.coordinates, gpsLocation: record.gpsLocation, gpsSource: record.gpsSource,
    locationEvidence: record.locationEvidence, conditions: record.conditions, conditionSources: record.conditionSources,
    quickCatch: record.quickCatch });
}
