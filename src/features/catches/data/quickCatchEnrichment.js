import { normalizeCoordinates, formatCoordinates } from "./coordinates.js";
import { calculateMoonPhase } from "../../../shared/utils/moonPhase.js";
import { fetchCatchWeather } from "../../../shared/data/catchWeather.js";
import { LIVE_GPS_MAX_ACCURACY_METERS } from "./catchVerification.js";
import { calculateCatchAstronomy, normalizeCatchEnvironment, ENVIRONMENT_FIELDS } from "./catchEnvironment.js";
import { normalizeQuickCatchTripSnapshot, isTripWaterTemperatureRelevant } from "./quickCatchTripSnapshot.js";
import { PRODUCT_LIMITS } from "../../../product/config/limits.js";
import { QUICK_CATCH_LOCATION_MAX_AGE_MS } from "./quickCatchLocationWarmup.js";

const MAX_ATTEMPTS = 3;
const originatingCameraCaptures = new Set();

/** Session-only evidence: another signed-in device (or a later reopening) must not supply its current GPS. */
export function registerQuickCatchCameraCapture(id) {
  if (typeof id !== "string" || !id) return;
  originatingCameraCaptures.add(id);
  if (originatingCameraCaptures.size > 250) originatingCameraCaptures.delete(originatingCameraCaptures.values().next().value);
}
const WEATHER_FIELDS = { airTempC: [-60, 60], pressureHpa: [300, 1200], windKmh: [0, 300] };
const MANUAL_GPS = new Set(["manual", "manual-map", "live-gps"]);
const empty = (value) => value === null || value === undefined || value === "";
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const safeCoordinates = (value) => value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
  ? normalizeCoordinates(value) : null;
const ownsClaim = (record, step, claim) => record?.quickCatch?.enrichment?.[step]?.status === "pending"
  && record.quickCatch.enrichment[step].attempts === claim.attempts
  && record.quickCatch.enrichment[step].nextAttemptAt === claim.nextAttemptAt;

export function quickCatchEnrichmentJob(status = "pending") {
  return { status, attempts: 0, nextAttemptAt: null };
}

/** The timestamp is an instant; an offset-free EXIF date is interpreted by the existing EXIF reader in the device zone. */
export function buildInitialQuickCatchMetadata({ metadata, inputSource, capturedAt }) {
  const values = { caughtAt: capturedAt, catchDateTimeSource: "default" };
  const provenance = { caughtAt: "device" };
  if (["camera", "gallery"].includes(inputSource) && validDate(metadata?.capturedAt)
    && Date.parse(metadata.capturedAt) <= Date.parse(capturedAt) + 5 * 60_000
    && Date.parse(metadata.capturedAt) >= Date.UTC(1900, 0, 1)) {
    values.caughtAt = new Date(metadata.capturedAt).toISOString();
    values.catchDateTimeSource = "photo-exif";
    provenance.caughtAt = "exif";
  }
  const coordinates = safeCoordinates(metadata?.coordinates);
  if (coordinates) {
    values.coordinates = coordinates;
    values.gpsLocation = formatCoordinates(coordinates);
    values.gpsSource = "photo-exif";
    provenance.coordinates = "exif";
  }
  const date = new Date(values.caughtAt);
  if (Number.isFinite(date.getTime())) {
    const pad = (number) => String(number).padStart(2, "0");
    const moonPhase = calculateMoonPhase(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, `${pad(date.getHours())}:${pad(date.getMinutes())}`);
    if (moonPhase) {
      values.conditions = { moonPhase };
      values.conditionSources = { moonPhase: "auto" };
      provenance.moonPhase = "derived";
    }
  }
  const astronomy = calculateCatchAstronomy(values.caughtAt, coordinates);
  if (astronomy) provenance.astronomy = "derived";
  return { values, provenance, ...(astronomy ? { environment: { astronomy } } : {}) };
}

/** A historical imported image must not inherit the currently active trip. No nearest-water inference. */
export function buildQuickCatchContext({ trip, methods = [], waters = [], baits = [], capturedAt }) {
  if (!trip || !trip.id || trip.endedAt || !validDate(trip.startedAt) || !validDate(capturedAt)
    || Date.parse(capturedAt) < Date.parse(trip.startedAt)) return { values: {}, provenance: {} };
  const values = { tripId: trip.id };
  const provenance = { tripId: "active_trip" };
  if (trip.locationName?.trim()) {
    values.locationName = trip.locationName.trim();
    provenance.locationName = "active_trip";
  }
  const method = methods.find((item) => item.key === trip.methodKey);
  if (method) {
    values.method = { key: method.key, label: method.label, isCustom: false };
    provenance.method = "active_trip";
  }
  const water = waters.find(item => item.id === trip.waterId && !item.deleted && (item.ownerId ?? null) === (trip.ownerId ?? null));
  if (water) {
    values.waterId = water.id;
    provenance.waterId = "active_trip";
    if (!values.locationName && typeof water.name === "string" && water.name.trim()) { values.locationName = water.name.trim(); provenance.locationName = "saved_water"; }
    const waterNumber = Number(water.waterNumber);
    if (String(water.waterNumber ?? "").trim() && Number.isInteger(waterNumber) && waterNumber >= 0 && waterNumber <= 99999999) {
      values.waterNumber = waterNumber; provenance.waterNumber = "saved_water";
    }
  }
  const selectedBaits = (Array.isArray(trip.baitKeys) ? trip.baitKeys : []).map(key => baits.find(item => item.key === key)).filter(Boolean);
  if (selectedBaits.length) {
    values.baits = selectedBaits.map(item => ({ key: item.key, label: item.label, isCustom: false }));
    provenance.baits = "active_trip";
  }
  if (typeof trip.waterDepthM === "number" && Number.isFinite(trip.waterDepthM) && trip.waterDepthM >= 0 && trip.waterDepthM <= PRODUCT_LIMITS.catch.depthM) {
    values.waterDepthM = trip.waterDepthM; provenance.waterDepthM = "active_trip";
  }
  if (["mud", "sand", "gravel", "rocks"].includes(trip.bottomType)) { values.bottomType = trip.bottomType; provenance.bottomType = "active_trip"; }
  const tripSnapshot = normalizeQuickCatchTripSnapshot({ tripId: trip.id, revision: trip.sync?.revision, updatedAt: trip.updatedAt,
    waterTemperatureMeasurement: trip.waterTemperatureMeasurement });
  const measurement = tripSnapshot?.waterTemperatureMeasurement;
  if (measurement && isTripWaterTemperatureRelevant(measurement, capturedAt)) {
    values.conditions = { waterTempC: measurement.valueC };
    values.conditionSources = { waterTempC: "auto" };
    provenance.waterTempC = "active_trip";
  }
  return { values, provenance, tripSnapshot };
}

export function acceptQuickCatchPosition(position, { now = Date.now(), capturedAt = now } = {}) {
  const coordinates = safeCoordinates(position?.coords);
  const timestamp = position?.timestamp;
  const accuracy = position?.coords?.accuracy;
  if (!coordinates || !Number.isFinite(timestamp) || !Number.isFinite(accuracy) || accuracy <= 0
    || accuracy > LIVE_GPS_MAX_ACCURACY_METERS || now - timestamp > QUICK_CATCH_LOCATION_MAX_AGE_MS
    || timestamp > now + 5_000 || Math.abs(timestamp - capturedAt) > QUICK_CATCH_LOCATION_MAX_AGE_MS) return null;
  return { coordinates, capturedAt: new Date(timestamp).toISOString(), accuracyMeters: accuracy, source: "live-gps" };
}

/** Never invokes geolocation in the prompt/denied/unknown permission states. Explicit timeout also covers broken browser callbacks. */
export async function collectQuickCatchLocation({ navigatorObject = globalThis.navigator, now = Date.now(), capturedAt = now, timeoutMs = 4_000 } = {}) {
  if (!navigatorObject?.permissions?.query || !navigatorObject?.geolocation?.getCurrentPosition) return null;
  try {
    let permissionTimer;
    let permission;
    try {
      permission = await Promise.race([
        navigatorObject.permissions.query({ name: "geolocation" }),
        new Promise((resolve) => { permissionTimer = setTimeout(() => resolve(null), timeoutMs); }),
      ]);
    } finally { clearTimeout(permissionTimer); }
    if (permission?.state !== "granted") return null;
    const position = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), timeoutMs);
      const finish = (value) => { clearTimeout(timeout); resolve(value); };
      try {
        navigatorObject.geolocation.getCurrentPosition(finish, () => finish(null), {
          enableHighAccuracy: true, maximumAge: 30_000, timeout: timeoutMs,
        });
      } catch { finish(null); }
    });
    return acceptQuickCatchPosition(position, { now: Math.max(now, Date.now()), capturedAt });
  } catch { return null; }
}

/** Called inside the repository's compare-and-swap transaction. Never spreads untrusted values onto a Catch. */
export function mergeQuickCatchEnrichment(record, patch) {
  if (record.captureMode !== "quick" || !record.quickCatch) return record;
  const next = { ...record, quickCatch: { ...record.quickCatch,
    provenance: { ...record.quickCatch.provenance }, enrichment: { ...record.quickCatch.enrichment } } };
  const values = patch.values ?? {};
  const source = patch.provenance ?? {};
  const provenance = next.quickCatch.provenance;
  if (validDate(values.caughtAt) && record.catchDateTimeSource !== "manual" && provenance.caughtAt === "device" && source.caughtAt === "exif") {
    next.caughtAt = values.caughtAt;
    next.catchDateTimeSource = "photo-exif";
    provenance.caughtAt = "exif";
  }
  const coordinates = safeCoordinates(values.coordinates);
  if (coordinates && !record.coordinates && !MANUAL_GPS.has(record.gpsSource) && provenance.coordinates !== "manual"
    && ["gps", "exif"].includes(source.coordinates)) {
    next.coordinates = coordinates;
    next.gpsLocation = formatCoordinates(coordinates);
    next.gpsSource = source.coordinates === "exif" ? "photo-exif" : "live-gps";
    provenance.coordinates = source.coordinates;
    if (source.coordinates === "gps" && values.locationEvidence) next.locationEvidence = values.locationEvidence;
  }
  const conditions = { ...record.conditions };
  const conditionSources = { ...record.conditionSources };
  for (const [field, range] of Object.entries(WEATHER_FIELDS)) {
    const value = values.conditions?.[field];
    if (empty(conditions[field]) && conditionSources[field] !== "manual" && provenance[field] !== "manual"
      && source[field] === "weather_api" && Number.isFinite(value) && value >= range[0] && value <= range[1]) {
      conditions[field] = value;
      conditionSources[field] = "auto";
      provenance[field] = "weather_api";
    }
  }
  if (Object.keys(conditions).length) next.conditions = conditions;
  next.conditionSources = conditionSources;
  const environment = normalizeCatchEnvironment(values.environment);
  if (environment) {
    const current = normalizeCatchEnvironment(record.quickCatch.environment) ?? { conditions: {} };
    const merged = { ...current, conditions: { ...current.conditions } };
    for (const field of Object.keys(ENVIRONMENT_FIELDS)) {
      if (source[field] === "weather_api" && provenance[field] !== "manual"
        && empty(merged.conditions[field]) && environment.conditions[field] !== undefined) {
        merged.conditions[field] = environment.conditions[field]; provenance[field] = "weather_api";
      }
    }
    if (environment.weather && source.weather === "weather_api") merged.weather = environment.weather;
    if (environment.astronomy && source.astronomy === "derived" && provenance.astronomy !== "manual"
      && environment.astronomy.forInstant === next.caughtAt) { merged.astronomy = environment.astronomy; provenance.astronomy = "derived"; }
    next.quickCatch.environment = merged;
  }
  for (const step of ["metadata", "weather"]) {
    const job = patch.jobs?.[step];
    if (!job || !["pending", "complete", "unavailable", "failed"].includes(job.status)
      || !Number.isInteger(job.attempts) || job.attempts < 0 || job.attempts > MAX_ATTEMPTS
      || (job.nextAttemptAt !== null && !validDate(job.nextAttemptAt))) continue;
    next.quickCatch.enrichment[step] = { status: job.status, attempts: job.attempts, nextAttemptAt: job.nextAttemptAt };
  }
  return next;
}

function jobDue(job, now) {
  return job?.status === "pending"
    && (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= now);
}

function stepReady(record, step, now, online) {
  if (!jobDue(record.quickCatch?.enrichment?.[step], now) || (step === "weather" && !online)) return false;
  if (step === "metadata" && !record.coordinates && record.quickCatch.inputSource === "camera"
    && !originatingCameraCaptures.has(record.id)
    && Math.abs(now - Date.parse(record.quickCatch.capturedAt)) <= QUICK_CATCH_LOCATION_MAX_AGE_MS) return false;
  // Do not let another device close the weather job while capture-origin GPS is still being collected.
  if (step === "weather" && !record.coordinates && record.quickCatch.enrichment?.metadata?.status === "pending") return false;
  return true;
}

function utcWeatherParts(record) {
  // An absolute UTC hour works for a foreign photo and a second device in another timezone.
  const timestamp = new Date(record.caughtAt).toISOString();
  return { date: timestamp.slice(0, 10), time: timestamp.slice(11, 16) };
}

/** Jobs live on the ordinary Catch and travel through its existing outbox; this is not another sync queue. */
export function createQuickCatchEnrichmentCoordinator({ repository, scope, applyPatch, onChange = () => {},
  fetchWeather = fetchCatchWeather, getLocation = collectQuickCatchLocation, online = () => globalThis.navigator?.onLine !== false,
  clock = () => Date.now() }) {
  const inFlight = new Set();
  const controller = new AbortController();
  const write = async (record, patch) => {
    if (controller.signal.aborted) return null;
    const result = await applyPatch(record.id, record.sync?.revision ?? 1, patch, scope);
    if (result) onChange(result);
    return result;
  };
  async function process(id) {
    let record = await repository.get(id, scope);
    if (!record?.quickCatch || record.captureMode !== "quick") return;
    for (const step of ["metadata", "weather"]) {
      if (controller.signal.aborted) return;
      const now = clock();
      const job = record.quickCatch.enrichment?.[step];
      if (!stepReady(record, step, now, online())) continue;
      if (job.attempts >= MAX_ATTEMPTS) {
        record = await write(record, { jobs: { [step]: { ...job, status: "failed", nextAttemptAt: null } } });
        if (!record) return;
        continue;
      }
      // Claim with CAS before making a request; the lease expires after interruption/reload.
      const claimedJob = { status: "pending", attempts: job.attempts + 1, nextAttemptAt: new Date(now + 60_000).toISOString() };
      record = await write(record, { jobs: { [step]: claimedJob } });
      if (!record) return;
      try {
        const patch = { values: {}, provenance: {}, jobs: {} };
        let status = "complete";
        if (step === "metadata") {
          // A location obtained after reopening or for an old import is not evidence for that catch.
          const captureTime = Date.parse(record.quickCatch.capturedAt);
          const originSession = originatingCameraCaptures.delete(record.id);
          const timelyCamera = originSession && record.quickCatch.inputSource === "camera" && Math.abs(now - captureTime) <= QUICK_CATCH_LOCATION_MAX_AGE_MS
            && Math.abs(Date.parse(record.caughtAt) - captureTime) <= QUICK_CATCH_LOCATION_MAX_AGE_MS;
          const evidence = !record.coordinates && timelyCamera ? await getLocation({ capturedAt: Date.parse(record.caughtAt), now }) : null;
          if (evidence) {
            patch.values.coordinates = evidence.coordinates;
            patch.values.locationEvidence = evidence;
            patch.provenance.coordinates = "gps";
          } else if (!record.coordinates) status = "unavailable";
          const astronomy = calculateCatchAstronomy(record.caughtAt, evidence?.coordinates ?? record.coordinates);
          if (astronomy) { patch.values.environment = { astronomy }; patch.provenance.astronomy = "derived"; }
        } else {
          const coordinates = safeCoordinates(record.coordinates);
          if (!coordinates) status = "unavailable";
          else {
            const { date, time } = utcWeatherParts(record);
            const weather = await fetchWeather(coordinates.latitude, coordinates.longitude, date, time, { signal: controller.signal, timezone: "UTC", includeDetails: true });
            patch.values.conditions = Object.fromEntries(Object.entries(WEATHER_FIELDS).filter(([field, range]) =>
              Number.isFinite(weather?.[field]) && weather[field] >= range[0] && weather[field] <= range[1]).map(([field]) => [field, weather[field]]));
            if (!Object.keys(patch.values.conditions).length) throw new Error("Počasí neobsahuje platné údaje.");
            patch.provenance = Object.fromEntries(Object.keys(WEATHER_FIELDS).map((field) => [field, "weather_api"]));
            patch.values.environment = normalizeCatchEnvironment(weather?.environment);
            Object.assign(patch.provenance, Object.fromEntries([...Object.keys(ENVIRONMENT_FIELDS), "weather"].map(field => [field, "weather_api"])));
          }
        }
        patch.jobs[step] = { ...claimedJob, status, nextAttemptAt: null };
        const latest = await repository.get(id, scope);
        if (!latest) return;
        if (!ownsClaim(latest, step, claimedJob)) return;
        // Weather belongs to the requested time/location. Ignore a response after either was edited.
        if (step === "weather" && (latest.caughtAt !== record.caughtAt || JSON.stringify(latest.coordinates) !== JSON.stringify(record.coordinates))) return;
        record = await write(latest, patch);
        if (!record) return;
      } catch {
        if (controller.signal.aborted) return;
        const latest = await repository.get(id, scope);
        if (!latest) return;
        if (!ownsClaim(latest, step, claimedJob)) return;
        const attempts = claimedJob.attempts;
        record = await write(latest, { jobs: { [step]: { attempts,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          nextAttemptAt: attempts >= MAX_ATTEMPTS ? null : new Date(clock() + 30_000 * 2 ** (attempts - 1)).toISOString() } } });
        if (!record) return;
      }
    }
  }
  return {
    async run(records) {
      if (controller.signal.aborted) return;
      const availableSlots = Math.max(0, 4 - inFlight.size);
      if (!availableSlots) return;
      await Promise.all(records.filter((record) => record.captureMode === "quick" && !inFlight.has(record.id)
        && ["metadata", "weather"].some((step) => stepReady(record, step, clock(), online())))
        .slice(0, availableSlots).map(async ({ id }) => {
        inFlight.add(id);
        try { await process(id); } catch { /* A storage error is retried on the next normal app wake. */ }
        finally { inFlight.delete(id); }
      }));
    },
    dispose() { controller.abort(); },
  };
}
