import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptQuickCatchPosition, buildInitialQuickCatchMetadata, buildQuickCatchContext,
  collectQuickCatchLocation, createQuickCatchEnrichmentCoordinator, mergeQuickCatchEnrichment,
  quickCatchEnrichmentJob,
  registerQuickCatchCameraCapture,
} from "./quickCatchEnrichment.js";

const capturedAt = "2026-11-04T12:00:00.000Z";
const earlier = "2026-10-01T10:00:00.000Z";
const coordinates = { latitude: 50, longitude: 14 };
function makeRecord(overrides = {}) {
  return { id: "catch-1", captureMode: "quick", caughtAt: capturedAt, catchDateTimeSource: "default",
    coordinates, conditionSources: {}, sync: { revision: 1 },
    quickCatch: { capturedAt, inputSource: "gallery", timeZone: "Europe/Prague",
      provenance: { caughtAt: "device" },
      enrichment: { metadata: quickCatchEnrichmentJob("complete"), weather: quickCatchEnrichmentJob() } }, ...overrides };
}
function fixture(record, options = {}) {
  let current = record;
  let now = Date.parse(capturedAt);
  const writes = [];
  const repository = { async get() { return structuredClone(current); } };
  const applyPatch = async (id, revision, patch) => {
    if (!current || current.id !== id || current.sync.revision !== revision) return null;
    current = mergeQuickCatchEnrichment(current, patch);
    current.sync = { revision: revision + 1 };
    writes.push(structuredClone(patch));
    return structuredClone(current);
  };
  const coordinator = createQuickCatchEnrichmentCoordinator({ repository, applyPatch,
    scope: { scopeKey: "guest:test" }, clock: () => now, fetchWeather: async () => ({ airTempC: 10 }), ...options });
  return { coordinator, writes, get record() { return current; },
    set record(value) { current = value; }, advance(ms) { now += ms; }, run() { return coordinator.run(current ? [current] : []); } };
}

test("camera and gallery prefer valid photo EXIF; absent EXIF falls back to the event instant", () => {
  const input = { capturedAt, metadata: { capturedAt: earlier }, inputSource: "camera" };
  assert.equal(buildInitialQuickCatchMetadata(input).values.caughtAt, earlier);
  const imported = buildInitialQuickCatchMetadata({ ...input, inputSource: "gallery" });
  assert.equal(imported.values.caughtAt, earlier);
  assert.equal(imported.provenance.caughtAt, "exif");
  assert.equal(buildInitialQuickCatchMetadata({ capturedAt, inputSource: "gallery" }).values.caughtAt, capturedAt);
});

test("invalid, implausibly future and before-1900 EXIF timestamps ignored", () => {
  for (const value of ["bad-date", "2027-11-04T12:00:00Z", "1800-01-01T00:00:00Z"]) {
    assert.equal(buildInitialQuickCatchMetadata({ capturedAt, inputSource: "gallery", metadata: { capturedAt: value } }).values.caughtAt, capturedAt);
  }
});

test("EXIF GPS and deterministic moon are sourced; null GPS never becomes 0,0", () => {
  const result = buildInitialQuickCatchMetadata({ capturedAt, inputSource: "gallery", metadata: { coordinates } });
  assert.deepEqual(result.values.coordinates, coordinates);
  assert.equal(result.provenance.coordinates, "exif");
  assert.equal(result.provenance.moonPhase, "derived");
  assert.equal(result.values.conditionSources.moonPhase, "auto");
  const invalid = buildInitialQuickCatchMetadata({ capturedAt, metadata: { coordinates: { latitude: null, longitude: null } } });
  assert.equal(invalid.values.coordinates, undefined);
});

test("active trip inherits only explicit existing fields; no bait or nearest-water guesses", () => {
  const trip = { id: "trip-1", startedAt: "2026-11-04T08:00:00Z", endedAt: null, locationName: " Moje voda ", methodKey: "float" };
  const context = buildQuickCatchContext({ trip, capturedAt, methods: [{ key: "float", label: "Plavaná" }] });
  assert.deepEqual(context.values, { tripId: "trip-1", locationName: "Moje voda", method: { key: "float", label: "Plavaná", isCustom: false } });
  assert.equal(context.provenance.locationName, "active_trip");
  assert.deepEqual(buildQuickCatchContext({ trip, capturedAt: earlier }).values, {});
  assert.deepEqual(buildQuickCatchContext({ trip: { ...trip, endedAt: capturedAt }, capturedAt }).values, {});
  assert.deepEqual(buildQuickCatchContext({ capturedAt }).values, {});
});

test("accurate fresh GPS accepted with timestamp/accuracy; stale, inaccurate, invalid rejected", () => {
  const now = Date.parse(capturedAt);
  const position = { timestamp: now, coords: { ...coordinates, accuracy: 15 } };
  assert.deepEqual(acceptQuickCatchPosition(position, { now }), { coordinates, capturedAt, accuracyMeters: 15, source: "live-gps" });
  assert.equal(acceptQuickCatchPosition({ ...position, timestamp: now - 16 * 60_000 }, { now }), null);
  assert.equal(acceptQuickCatchPosition({ ...position, coords: { ...coordinates, accuracy: 151 } }, { now }), null);
  assert.equal(acceptQuickCatchPosition({ ...position, coords: { latitude: null, longitude: null, accuracy: 15 } }, { now }), null);
  assert.equal(acceptQuickCatchPosition(position, { now, capturedAt: now - 16 * 60_000 }), null);
});

test("denied, prompt, unavailable permission never invokes geolocation", async () => {
  let requests = 0;
  for (const state of ["denied", "prompt"]) {
    assert.equal(await collectQuickCatchLocation({ navigatorObject: {
      permissions: { query: async () => ({ state }) }, geolocation: { getCurrentPosition() { requests++; } },
    } }), null);
  }
  assert.equal(await collectQuickCatchLocation({ navigatorObject: {} }), null);
  assert.equal(requests, 0);
});

test("granted GPS works; timeout and denied callback resolve without capture failure", async () => {
  const now = Date.now();
  const navigatorObject = { permissions: { query: async () => ({ state: "granted" }) },
    geolocation: { getCurrentPosition(success) { success({ timestamp: now, coords: { ...coordinates, accuracy: 10 } }); } } };
  assert.deepEqual((await collectQuickCatchLocation({ navigatorObject, now })).coordinates, coordinates);
  navigatorObject.geolocation.getCurrentPosition = () => {};
  assert.equal(await collectQuickCatchLocation({ navigatorObject, timeoutMs: 5 }), null);
  navigatorObject.geolocation.getCurrentPosition = (success, error) => error(new Error("denied"));
  assert.equal(await collectQuickCatchLocation({ navigatorObject }), null);
  navigatorObject.permissions.query = () => new Promise(() => {});
  assert.equal(await collectQuickCatchLocation({ navigatorObject, timeoutMs: 5 }), null);
});

test("merge cannot overwrite manual date, coordinates, weather or manually cleared conditions", () => {
  const record = makeRecord({ caughtAt: earlier, catchDateTimeSource: "manual", coordinates: null,
    gpsSource: "manual-map", conditions: { airTempC: 5 }, conditionSources: { airTempC: "manual", pressureHpa: "manual" } });
  const next = mergeQuickCatchEnrichment(record, { values: { caughtAt: capturedAt, coordinates, conditions: { airTempC: 20, pressureHpa: 1000, windKmh: 5 } },
    provenance: { caughtAt: "exif", coordinates: "gps", airTempC: "weather_api", pressureHpa: "weather_api", windKmh: "weather_api" } });
  assert.equal(next.caughtAt, earlier);
  assert.equal(next.coordinates, null);
  assert.deepEqual(next.conditions, { airTempC: 5, windKmh: 5 });
  assert.equal(record.conditions.windKmh, undefined);
});

test("merge validates weather ranges and only whitelisted fields", () => {
  const record = makeRecord();
  const next = mergeQuickCatchEnrichment(record, { values: { ownerId: "other", species: "Kapr", conditions: { airTempC: 65, pressureHpa: 1000, windKmh: 999, weightKg: 20 } },
    provenance: { airTempC: "weather_api", pressureHpa: "weather_api", windKmh: "weather_api", weightKg: "weather_api" } });
  assert.deepEqual(next.conditions, { pressureHpa: 1000 });
  assert.equal(next.species, undefined);
  assert.equal(next.ownerId, undefined);
  assert.equal(mergeQuickCatchEnrichment({ id: "old" }, {}).id, "old");
});

test("successful enrichment is idempotent and uses existing historical weather service contract", async () => {
  const requests = [];
  const f = fixture(makeRecord(), { fetchWeather: async (...args) => { requests.push(args); return { airTempC: 10, pressureHpa: 1001 }; } });
  await f.run();
  await f.run();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].slice(0, 4), [50, 14, "2026-11-04", "12:00"]);
  assert.equal(requests[0][4].timezone, "UTC");
  assert.deepEqual(f.record.conditions, { airTempC: 10, pressureHpa: 1001 });
  assert.equal(f.record.quickCatch.enrichment.weather.status, "complete");
  assert.equal(f.record.quickCatch.provenance.airTempC, "weather_api");
});

test("offline does not start weather; reconnect resumes ordinary Catch job", async () => {
  let online = false;
  let requests = 0;
  const f = fixture(makeRecord(), { online: () => online, fetchWeather: async () => { requests++; return { airTempC: 9 }; } });
  await f.run();
  assert.equal(requests, 0);
  assert.equal(f.record.quickCatch.enrichment.weather.attempts, 0);
  online = true;
  await f.run();
  assert.equal(requests, 1);
});

test("weather failures back off, retry after reopening, and terminate at three attempts", async () => {
  let requests = 0;
  const f = fixture(makeRecord(), { fetchWeather: async () => { requests++; throw new Error("outage"); } });
  await f.run();
  await f.run();
  assert.equal(requests, 1);
  assert.equal(f.record.quickCatch.enrichment.weather.status, "pending");
  f.advance(30_000);
  await f.run();
  f.advance(60_000);
  await f.run();
  assert.equal(requests, 3);
  assert.equal(f.record.quickCatch.enrichment.weather.status, "failed");
  f.advance(10 * 60_000);
  await f.run();
  assert.equal(requests, 3);
  const recovered = fixture(structuredClone(f.record));
  await recovered.run();
  assert.equal(recovered.writes.length, 0);
});

test("interrupted final lease becomes terminal without fourth request", async () => {
  const record = makeRecord();
  record.quickCatch.enrichment.weather = { status: "pending", attempts: 3, nextAttemptAt: earlier };
  let requests = 0;
  const f = fixture(record, { fetchWeather: async () => { requests++; return {}; } });
  await f.run();
  assert.equal(requests, 0);
  assert.equal(f.record.quickCatch.enrichment.weather.status, "failed");
});

test("missing GPS ends weather quietly and does not infer a water", async () => {
  const f = fixture(makeRecord({ coordinates: null }));
  await f.run();
  assert.equal(f.record.quickCatch.enrichment.weather.status, "unavailable");
  assert.equal(f.record.waterId, undefined);
});

test("delayed weather cannot overwrite manual edits including clears", async () => {
  let finish;
  const f = fixture(makeRecord(), { fetchWeather: () => new Promise((resolve) => { finish = resolve; }) });
  const running = f.run();
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
  f.record = { ...f.record, conditions: { airTempC: 3 }, conditionSources: { airTempC: "manual", windKmh: "manual" }, sync: { revision: f.record.sync.revision + 1 } };
  finish({ airTempC: 20, pressureHpa: 1010, windKmh: 8 });
  await running;
  assert.deepEqual(f.record.conditions, { airTempC: 3, pressureHpa: 1010 });
});

test("deleted catch never resurrected by a delayed response", async () => {
  let finish;
  const f = fixture(makeRecord(), { fetchWeather: () => new Promise((resolve) => { finish = resolve; }) });
  const running = f.run();
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
  f.record = null;
  finish({ airTempC: 9 });
  await running;
  assert.equal(f.record, null);
});

test("changed date or coordinates reject stale weather; newer worker claims never reverted", async () => {
  for (const edit of ["date", "coordinates", "claim"]) {
    let finish;
    const f = fixture(makeRecord(), { fetchWeather: () => new Promise((resolve) => { finish = resolve; }) });
    const running = f.run();
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
    if (edit === "date") f.record.caughtAt = earlier;
    if (edit === "coordinates") f.record.coordinates = { latitude: 49, longitude: 15 };
    if (edit === "claim") f.record.quickCatch.enrichment.weather = { status: "complete", attempts: 2, nextAttemptAt: null };
    f.record.sync.revision++;
    finish({ airTempC: 9 });
    await running;
    assert.equal(f.record.conditions, undefined);
    if (edit === "claim") assert.equal(f.record.quickCatch.enrichment.weather.attempts, 2);
  }
});

test("GPS only sampled for recent camera captures, never old images or after a long reload", async () => {
  let requests = 0;
  const location = async () => { requests++; return { coordinates, source: "live-gps", capturedAt, accuracyMeters: 10 }; };
  const camera = makeRecord({ coordinates: null });
  camera.quickCatch.inputSource = "camera";
  camera.quickCatch.enrichment.metadata = quickCatchEnrichmentJob();
  registerQuickCatchCameraCapture(camera.id);
  const f = fixture(camera, { getLocation: location });
  await f.run();
  assert.equal(requests, 1);
  assert.deepEqual(f.record.coordinates, coordinates);
  assert.equal(f.record.locationEvidence.accuracyMeters, 10);
  const old = structuredClone(camera);
  const g = fixture(old, { getLocation: location });
  g.advance(2 * 60_000);
  await g.run();
  assert.equal(requests, 1);
  assert.equal(g.record.quickCatch.enrichment.metadata.status, "unavailable");
});

test("a synced camera capture on another device never acquires that device's current GPS", async () => {
  let requests = 0;
  const remote = makeRecord({ id: "remote-camera-capture", coordinates: null });
  remote.quickCatch.inputSource = "camera";
  remote.quickCatch.enrichment.metadata = quickCatchEnrichmentJob();
  const f = fixture(remote, { getLocation: async () => { requests++; return { coordinates }; } });
  await f.run();
  assert.equal(requests, 0);
  assert.equal(f.record.coordinates, null);
  assert.equal(f.record.quickCatch.enrichment.metadata.status, "pending");
  assert.equal(f.record.quickCatch.enrichment.weather.status, "pending");
  assert.equal(f.writes.length, 0);
  f.advance(2 * 60_000);
  await f.run();
  assert.equal(requests, 0);
  assert.equal(f.record.quickCatch.enrichment.metadata.status, "unavailable");
});

test("concurrent calls and disposal do not duplicate requests or write after disposal", async () => {
  let finish;
  let requests = 0;
  const f = fixture(makeRecord(), { fetchWeather: () => { requests++; return new Promise((resolve) => { finish = resolve; }); } });
  const running = f.run();
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
  await f.run();
  assert.equal(requests, 1);
  f.coordinator.dispose();
  finish({ airTempC: 11 });
  await running;
  assert.equal(f.record.conditions, undefined);
});

test("a failed stale request cannot reopen a job completed by another worker", async () => {
  let fail;
  const f = fixture(makeRecord(), { fetchWeather: () => new Promise((resolve, reject) => { fail = reject; }) });
  const running = f.run();
  while (!fail) await new Promise((resolve) => setTimeout(resolve, 0));
  f.record.quickCatch.enrichment.weather = { status: "complete", attempts: 2, nextAttemptAt: null };
  f.record.sync.revision++;
  fail(new Error("late outage"));
  await running;
  assert.deepEqual(f.record.quickCatch.enrichment.weather, { status: "complete", attempts: 2, nextAttemptAt: null });
});

test("a single wake processes at most four records", async () => {
  const records = Array.from({ length: 8 }, (_, index) => makeRecord({ id: `catch-${index}` }));
  let reads = 0;
  const coordinator = createQuickCatchEnrichmentCoordinator({
    repository: { async get(id) { reads++; return records.find((record) => record.id === id); } },
    applyPatch: async () => null, scope: {}, clock: () => Date.parse(capturedAt),
  });
  await coordinator.run(records);
  assert.equal(reads, 4);
});

test("overlapping wake events share the four-record concurrency limit", async () => {
  const records = Array.from({ length: 12 }, (_, index) => makeRecord({ id: `overlap-${index}` }));
  let reads = 0;
  const releases = [];
  const coordinator = createQuickCatchEnrichmentCoordinator({
    repository: { async get(id) { reads++; return records.find((record) => record.id === id); } },
    applyPatch: () => new Promise((resolve) => releases.push(resolve)), scope: {}, clock: () => Date.parse(capturedAt),
  });
  const running = coordinator.run(records);
  while (releases.length < 4) await new Promise((resolve) => setTimeout(resolve, 0));
  await coordinator.run(records);
  await coordinator.run(records);
  assert.equal(reads, 4);
  assert.equal(releases.length, 4);
  for (const release of releases) release(null);
  await running;
});

test("trip water and known bait defaults inherit only explicit owned selections", () => {
  const trip = { id: "trip-1", ownerId: "owner", startedAt: "2026-11-04T10:00:00Z", waterId: "water-1", baitKeys: ["corn", "invented"] };
  const options = { trip, capturedAt, waters: [{ id: "water-1", ownerId: "owner", name: "Labe", waterNumber: "123456" }], baits: [{ key: "corn", label: "Kukuřice" }] };
  const value = buildQuickCatchContext(options);
  assert.equal(value.values.waterId, "water-1"); assert.equal(value.values.waterNumber, 123456);
  assert.deepEqual(value.values.baits, [{ key: "corn", label: "Kukuřice", isCustom: false }]);
  assert.equal(value.provenance.waterId, "active_trip");
  assert.equal(buildQuickCatchContext({ ...options, waters: [{ id: "water-1", ownerId: "other", name: "Cizí" }] }).values.waterId, undefined);
  assert.deepEqual(buildQuickCatchContext({ ...options, capturedAt: earlier }).values, {});
});

test("extended weather preserves manual values and cleared fields during delayed enrichment", () => {
  const record = makeRecord({ quickCatch: { ...makeRecord().quickCatch, environment: { conditions: { humidityPct: 66 } },
    provenance: { humidityPct: "manual", cloudCoverPct: "manual" } } });
  const merged = mergeQuickCatchEnrichment(record, { values: { environment: { conditions: { humidityPct: 80, cloudCoverPct: 50, precipitationMm: 0 } } },
    provenance: { humidityPct: "weather_api", cloudCoverPct: "weather_api", precipitationMm: "weather_api" } });
  assert.equal(merged.quickCatch.environment.conditions.humidityPct, 66);
  assert.equal(merged.quickCatch.environment.conditions.cloudCoverPct, undefined);
  assert.equal(merged.quickCatch.environment.conditions.precipitationMm, 0);
});
