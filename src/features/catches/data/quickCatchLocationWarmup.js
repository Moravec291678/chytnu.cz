import { LIVE_GPS_MAX_ACCURACY_METERS } from "./catchVerification.js";

export const QUICK_CATCH_LOCATION_MAX_AGE_MS = 60_000;
export const QUICK_CATCH_LOCATION_TIMEOUT_MS = 4_000;

// One camera opening, one bounded request. Nothing is stored, broadcast or tracked.
// Inject the existing granted-permission-only collector to avoid a dependency cycle
// with the enrichment coordinator that consumes this evidence after local saving.
export function createQuickCatchLocationWarmup({ collectLocation, clock = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let current = null;
  const clear = scopeKey => {
    if (!current || (scopeKey !== undefined && scopeKey !== current.scopeKey)) return;
    clearTimer(current.timer);
    current.finish();
    current = null;
  };
  const begin = (scopeKey, options = {}) => {
    clear();
    if (typeof scopeKey !== "string" || !scopeKey || scopeKey.length > 256) return Promise.resolve();
    const collector = options.collectLocation ?? collectLocation;
    if (typeof collector !== "function") return Promise.resolve();
    const startedAt = clock();
    if (!Number.isFinite(startedAt)) return Promise.resolve();
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const request = { scopeKey, startedAt, evidence: null, timer: null, finish, settled: false };
    current = request;
    const complete = evidence => {
      if (current !== request || request.settled) return;
      request.settled = true;
      clearTimer(request.timer);
      request.evidence = evidence;
      finish();
    };
    request.timer = setTimer(() => complete(null), QUICK_CATCH_LOCATION_TIMEOUT_MS);
    void Promise.resolve().then(() => current === request && !request.settled
      ? collector({ capturedAt: startedAt, now: startedAt, timeoutMs: QUICK_CATCH_LOCATION_TIMEOUT_MS }) : null)
      .then(complete, () => complete(null));
    return pending;
  };
  const take = (scopeKey, capturedAt) => {
    if (!current || current.scopeKey !== scopeKey) return null;
    const request = current;
    clear(scopeKey); // Consumed once; late permission/GPS callbacks cannot revive it.
    const evidence = request.evidence;
    const capture = typeof capturedAt === "number" ? capturedAt : Date.parse(capturedAt);
    const measured = Date.parse(evidence?.capturedAt);
    const now = clock();
    const accuracy = evidence?.accuracyMeters;
    const latitude = evidence?.coordinates?.latitude, longitude = evidence?.coordinates?.longitude;
    if (!evidence || evidence.source !== "live-gps" || !Number.isFinite(capture) || !Number.isFinite(measured)
      || !Number.isFinite(now) || now - request.startedAt > QUICK_CATCH_LOCATION_MAX_AGE_MS
      || now < request.startedAt || capture > now + 5_000 || measured > now + 5_000
      || Math.abs(measured - capture) > QUICK_CATCH_LOCATION_MAX_AGE_MS
      || Math.abs(request.startedAt - capture) > QUICK_CATCH_LOCATION_MAX_AGE_MS
      || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > LIVE_GPS_MAX_ACCURACY_METERS
      || typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90
      || typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
    return { coordinates: { latitude, longitude }, accuracyMeters: accuracy,
      capturedAt: new Date(measured).toISOString(), source: "live-gps" };
  };
  return { begin, take, clear };
}

const warmup = createQuickCatchLocationWarmup();
export const beginQuickCatchLocation = (scopeKey, options) => warmup.begin(scopeKey, options);
export const takeQuickCatchLocation = (scopeKey, capturedAt) => warmup.take(scopeKey, capturedAt);
export const clearQuickCatchLocation = scopeKey => warmup.clear(scopeKey);
