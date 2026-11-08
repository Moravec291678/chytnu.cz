import { DEFAULT_SPECIES } from "../../shared/constants/speciesCatalog.js";
import { APP_META_STORE_NAME, CATCH_STORE_NAME, openLocalDatabase } from "../catches/data/catchRepository.js";
import { quickCaptureGenerationKey } from "../catches/data/quickCaptureLifecycle.js";
import { AI_FEATURES, hasAiConsent } from "./aiPolicy.js";
import { validateSpeciesSuggestion } from "./speciesSuggestion.js";

export const AUTOMATIC_SPECIES_CHANGED = "chytnu:automatic-species-changed";
const DAY = 86_400_000;
const hashOf = photo => photo?.cloud?.sha256 || photo?.contentSha256;
const photoOf = record => record.photos?.find(photo => photo.id === record.primaryPhotoId) ?? record.photos?.[0];
const manual = record => Boolean(record.speciesKey) || record.quickCatch?.provenance?.speciesKey === "manual";
const keyOf = (scopeKey, record, photo) => JSON.stringify(["automaticSpecies-v1", scopeKey, record.id, photo.id, hashOf(photo)]);
const consentKey = scopeKey => JSON.stringify(["automaticSpeciesConsent-v1", scopeKey]);
const requestValue = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

export function automaticSpeciesEligible(record, consent, ownerId) {
  return AI_FEATURES.species && record?.ownerId === ownerId && !record.deleted && record.captureMode === "quick" && !manual(record)
    && hasAiConsent(consent, "species", "cloudflare") && consent.automaticSpecies === true
    && Number.isFinite(Date.parse(consent.automaticSpeciesFrom)) && Number.isFinite(Date.parse(record.createdAt))
    && Date.parse(record.createdAt) >= Date.parse(consent.automaticSpeciesFrom);
}

async function localJobs(scope) {
  const db = await openLocalDatabase();
  try {
    const tx = db.transaction(APP_META_STORE_NAME, "readonly");
    return (await requestValue(tx.objectStore(APP_META_STORE_NAME).getAll()))
      .filter(row => row.kind === "automaticSpecies" && row.scopeKey === scope.scopeKey && row.ownerId === scope.ownerId);
  } finally { db.close(); }
}

async function rememberConsent(scope, consent, generation) {
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_META_STORE_NAME, "readwrite"), store = tx.objectStore(APP_META_STORE_NAME);
    const request = store.get(quickCaptureGenerationKey(scope.scopeKey));
    request.onsuccess = () => {
      if ((request.result?.generation ?? null) !== generation) return;
      store.put({ key: consentKey(scope.scopeKey), kind: "automaticSpecies", scopeKey: scope.scopeKey, ownerId: scope.ownerId, consent });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

async function pruneObsoleteJobs(scope) {
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([APP_META_STORE_NAME, CATCH_STORE_NAME], "readwrite");
    const cursor = tx.objectStore(APP_META_STORE_NAME).openCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return;
      const row = entry.value;
      if (row.kind !== "automaticSpecies" || row.scopeKey !== scope.scopeKey || row.ownerId !== scope.ownerId || !row.catchId) { entry.continue(); return; }
      const request = tx.objectStore(CATCH_STORE_NAME).get(row.catchId);
      request.onsuccess = () => {
        const current = request.result, photo = photoOf(current ?? {});
        if (!current || current.deleted || current.ownerId !== scope.ownerId || manual(current)
          || photo?.id !== row.photoId || hashOf(photo) !== row.sourceSha256) entry.delete();
        entry.continue();
      };
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function readAutomaticSpecies(records, scope) {
  if (!scope.ownerId) return records;
  const jobs = new Map((await localJobs(scope)).map(row => [row.key, row]));
  return records.map(record => {
    if (manual(record) || record.ownerId !== scope.ownerId || record.deleted) return record;
    const photo = photoOf(record);
    if (!photo || !/^[a-f0-9]{64}$/.test(hashOf(photo) ?? "")) return record;
    const row = jobs.get(keyOf(scope.scopeKey, record, photo));
    if (!row) return record;
    return { ...record, aiRecognition: { status: row.status, retryAt: row.retryAt, message: row.message },
      ...(["suggestion", "unknown"].includes(row.status) && row.result ? { aiSpeciesSuggestion: { ...row.result,
        photoId: photo.id, ownerId: scope.ownerId, consentRevision: row.consentRevision } } : {}) };
  });
}

export function suggestedSpeciesForDisplay(record) {
  if (!record || manual(record) || record.deleted) return null;
  const value = record.aiSpeciesSuggestion, photo = photoOf(record);
  if (value?.status !== "suggestion" || value.ownerId !== record.ownerId || value.photoId !== photo?.id
    || value.sourceSha256 !== hashOf(photo)) return null;
  return DEFAULT_SPECIES.find(species => species.key === value.speciesKey) ?? null;
}

// This writes only separate job/cache metadata. The Catch store is read in the
// same transaction to fence deletion, owner changes and manual correction.
async function writeJob(scope, record, photo, patch, generation) {
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([APP_META_STORE_NAME, CATCH_STORE_NAME], "readwrite");
    const meta = tx.objectStore(APP_META_STORE_NAME), key = keyOf(scope.scopeKey, record, photo);
    let changed = false;
    const currentRequest = tx.objectStore(CATCH_STORE_NAME).get(record.id);
    const generationRequest = meta.get(quickCaptureGenerationKey(scope.scopeKey));
    const previousRequest = meta.get(key);
    let completed = 0;
    const ready = () => {
      if (++completed !== 3) return;
      const current = currentRequest.result, currentPhoto = photoOf(current ?? {});
      if (!current || current.deleted || current.ownerId !== scope.ownerId || current.scopeKey !== scope.scopeKey || manual(current)
        || currentPhoto?.id !== photo.id || hashOf(currentPhoto) !== hashOf(photo)
        || (generationRequest.result?.generation ?? null) !== generation) return;
      meta.put({ ...(previousRequest.result ?? {}), ...patch, key, kind: "automaticSpecies", scopeKey: scope.scopeKey,
        ownerId: scope.ownerId, catchId: record.id, photoId: photo.id, sourceSha256: hashOf(photo) });
      changed = true;
    };
    currentRequest.onsuccess = generationRequest.onsuccess = previousRequest.onsuccess = ready;
    tx.oncomplete = () => { db.close(); resolve(changed); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("AI stav nelze uložit.")); };
  });
}

export function createAutomaticSpeciesCoordinator({ scope, repository, client, online = () => globalThis.navigator?.onLine !== false,
  now = () => Date.now(), changed = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let stopped = false, running = false, rerunRequested = false, timer = null;
  const controller = new AbortController();
  const run = async () => {
    if (stopped || !scope.ownerId) return;
    if (running) { rerunRequested = true; return; }
    running = true;
    if (timer) clearTimer(timer);
    try {
      const generation = await repository.getQuickCaptureGeneration(scope);
      await pruneObsoleteJobs(scope);
      const records = await repository.listMetadata(scope);
      const jobs = new Map((await localJobs(scope)).map(row => [row.key, row]));
      const consent = online() ? await client.getConsent({ signal: controller.signal }) : jobs.get(consentKey(scope.scopeKey))?.consent ?? null;
      if (online() && !stopped) await rememberConsent(scope, consent, generation);
      let earliest = Infinity, sharedDeferral = null;
      for (const record of records) {
        if (stopped || record.ownerId !== scope.ownerId || record.deleted || record.captureMode !== "quick" || manual(record)) continue;
        const photo = photoOf(record);
        if (!photo || !/^[a-f0-9]{64}$/.test(hashOf(photo) ?? "")) continue;
        const previous = jobs.get(keyOf(scope.scopeKey, record, photo));
        const save = patch => stopped ? false : writeJob(scope, record, photo, patch, generation).then(written => { if (written) changed(); return written; });
        if (!online()) {
          if (!automaticSpeciesEligible(record, consent, scope.ownerId)) await save({ status: "consent_required", result: null });
          else if (!["suggestion", "unknown"].includes(previous?.status)) await save({ status: "waiting_internet" });
          continue;
        }
        if (!automaticSpeciesEligible(record, consent, scope.ownerId)) {
          if (previous && previous.status !== "consent_required") await save({ status: "consent_required", result: null });
          continue;
        }
        if (["suggestion", "unknown"].includes(previous?.status) && previous.consentRevision === consent.revision) continue;
        if (photo.cloud?.state !== "synced") { await save({ status: "waiting_photo", consentRevision: consent.revision }); continue; }
        if (sharedDeferral) { await save({ status: "deferred", ...sharedDeferral, result: null }); continue; }
        if (Date.parse(previous?.retryAt) > now()) { earliest = Math.min(earliest, Date.parse(previous.retryAt)); continue; }
        const day = Math.floor(now() / DAY), attempts = previous?.day === day ? previous.attempts ?? 0 : 0;
        if (attempts >= 3) { earliest = Math.min(earliest, (day + 1) * DAY); continue; }
        if (!await save({ status: "running", day, attempts: attempts + 1, consentRevision: consent.revision, retryAt: null })) continue;
        try {
          const cached = await client.automaticSpecies({ catchId: record.id, photoId: photo.id, statusOnly: true }, { consent, signal: controller.signal });
          const result = ["suggestion", "unknown"].includes(cached.status) ? cached
            : await client.automaticSpecies({ catchId: record.id, photoId: photo.id }, { consent, signal: controller.signal });
          if (["confirmed", "ineligible"].includes(result.status)) { await save({ status: "confirmed", result: null }); continue; }
          if (result.sourceSha256 !== hashOf(photo)) throw Object.assign(new Error("Fotografie se mezitím změnila. Nový návrh počká na synchronizaci."), { code: "stale_catch" });
          const { sourceSha256, ...prediction } = result;
          const validated = validateSpeciesSuggestion(prediction);
          await save({ status: validated.status, result: { ...validated, sourceSha256 }, retryAt: null });
        } catch (error) {
          if (stopped) break;
          const hard = ["provider_auth", "provider_configuration", "provider_throttled", "consent_required", "disabled"].includes(error.code);
          const retryAt = error.retryAt || new Date(hard ? (day + 1) * DAY : now() + 15 * 60_000).toISOString();
          if (["user_daily_limit", "app_daily_limit", "provider_quota"].includes(error.code)) sharedDeferral = { retryAt, message: error.message };
          await save({ status: hard ? "unavailable" : "deferred", message: error.message, retryAt, result: null });
          earliest = Math.min(earliest, Date.parse(retryAt));
        }
      }
      if (!stopped && Number.isFinite(earliest)) timer = setTimer(() => void run(), Math.max(1000, Math.min(earliest - now(), 2_147_000_000)));
    } catch { /* Offline/auth transitions preserve durable jobs and original capture. */ }
    finally {
      running = false;
      if (!stopped && rerunRequested) { rerunRequested = false; if (timer) clearTimer(timer); timer = setTimer(() => void run(), 0); }
    }
  };
  return { run, stop() { stopped = true; controller.abort(); if (timer) clearTimer(timer); } };
}
