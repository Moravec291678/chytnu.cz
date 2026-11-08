import { normalizeCatchEnvironment, ENVIRONMENT_FIELDS } from "./catchEnvironment.js";
import { normalizeQuickCatchTripSnapshot } from "./quickCatchTripSnapshot.js";
// Deliberately bounded: photo bytes, GPS, notes and provider responses belong to
// their existing fields, never to this bookkeeping envelope.
export const QUICK_CATCH_PROVENANCE_FIELDS = Object.freeze([
  "caughtAt", "coordinates", "tripId", "locationName", "waterId", "waterNumber",
  "method", "baits", "moonPhase", "airTempC", "pressureHpa", "windKmh",
  "speciesKey", "lengthCm", "weightKg", "girthCm", "fightMinutes", "gpsLocation", "notes", "result", "waterDepthM", "bottomType", "waterTempC",
  ...Object.keys(ENVIRONMENT_FIELDS), "astronomy",
]);
export const QUICK_CATCH_SOURCES = Object.freeze([
  "manual", "device", "exif", "active_trip", "saved_water", "gps", "weather_api", "derived", "ai_suggestion",
]);
const JOB_STATUSES = ["pending", "complete", "unavailable", "failed"];
const timestamp = (value) => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));

export function normalizeQuickCatchMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !timestamp(value.capturedAt) || !["camera", "gallery"].includes(value.inputSource)) {
    throw new TypeError("Rychlý úlovek nemá platné údaje o pořízení fotografie.");
  }
  const unavailable = () => ({ status: "unavailable", attempts: 0, nextAttemptAt: null });
  const result = { capturedAt: value.capturedAt, inputSource: value.inputSource,
    timeZone: "UTC", timezoneOffsetMinutes: 0, provenance: {},
    enrichment: { metadata: unavailable(), weather: unavailable() } };
  if (value.timeZone !== undefined) {
    if (typeof value.timeZone !== "string" || value.timeZone.length > 100) throw new TypeError("Neplatné časové pásmo úlovku.");
    result.timeZone = value.timeZone;
  }
  if (value.timezoneOffsetMinutes !== undefined) {
    if (!Number.isInteger(value.timezoneOffsetMinutes) || Math.abs(value.timezoneOffsetMinutes) > 840) throw new TypeError("Neplatný časový posun úlovku.");
    result.timezoneOffsetMinutes = value.timezoneOffsetMinutes;
  }
  if (value.provenance !== undefined) {
    if (!value.provenance || typeof value.provenance !== "object" || Array.isArray(value.provenance)) throw new TypeError("Neplatný původ údajů úlovku.");
    result.provenance = Object.fromEntries(Object.entries(value.provenance)
      .filter(([field, source]) => QUICK_CATCH_PROVENANCE_FIELDS.includes(field) && QUICK_CATCH_SOURCES.includes(source)));
  }
  if (value.enrichment !== undefined) {
    if (!value.enrichment || typeof value.enrichment !== "object" || Array.isArray(value.enrichment)) throw new TypeError("Neplatný stav doplňování úlovku.");
    for (const step of ["metadata", "weather"]) {
      const job = value.enrichment[step];
      if (job === undefined) continue;
      if (!job || !JOB_STATUSES.includes(job.status) || !Number.isInteger(job.attempts)
        || job.attempts < 0 || job.attempts > 3 || (job.nextAttemptAt != null && !timestamp(job.nextAttemptAt))) {
        throw new TypeError("Neplatný stav doplňování úlovku.");
      }
      result.enrichment[step] = { status: job.status, attempts: job.attempts, nextAttemptAt: job.nextAttemptAt ?? null };
    }
  }
  const environment = normalizeCatchEnvironment(value.environment);
  if (environment) result.environment = environment;
  const tripSnapshot = normalizeQuickCatchTripSnapshot(value.tripSnapshot);
  if (tripSnapshot) result.tripSnapshot = tripSnapshot;
  return result;
}

// Optional bookkeeping uses bounded JSON on the wire. This preserves strict
// validation of all existing catch fields within Firestore's expression budget.
export const MAX_QUICK_CATCH_METADATA_JSON_LENGTH = 4096;
export function quickCatchMetadataToRemote(value) {
  const json = JSON.stringify(normalizeQuickCatchMetadata(value));
  if (json.length > MAX_QUICK_CATCH_METADATA_JSON_LENGTH) throw new RangeError("Údaje rychlého úlovku jsou příliš velké.");
  return json;
}

export function quickCatchMetadataFromRemote(value) {
  try {
    if (typeof value !== "string" || value.length > MAX_QUICK_CATCH_METADATA_JSON_LENGTH) return null;
    return normalizeQuickCatchMetadata(JSON.parse(value));
  } catch {
    // Owner-authored bookkeeping is untrusted. Invalid metadata must not hide
    // an otherwise valid catch or prevent its ordinary editor from opening.
    return null;
  }
}
