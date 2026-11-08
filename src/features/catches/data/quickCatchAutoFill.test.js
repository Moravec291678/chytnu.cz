import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { createQuickCapture, prepareQuickCatch, persistQuickCatch } from "./quickCatch.js";
import { catchToForm, createCatchRecord } from "./catchModel.js";
import { buildCatchEnvironmentPresentation } from "./catchEnvironmentPresentation.js";
import { quickCatchMetadataToRemote, quickCatchMetadataFromRemote } from "./quickCatchMetadata.js";
import { isTripWaterTemperatureRelevant } from "./quickCatchTripSnapshot.js";
import { catchRepository } from "./catchRepository.js";
import { sha256Blob } from "./photoCloudProvider.js";
import { tripRepository } from "../../trips/data/tripRepository.js";

const at = "2026-11-08T09:00:42.000Z";
const blob = new Blob([new Uint8Array([255, 216, 1, 255, 217])], { type: "image/jpeg" });
const methods = [{ key: "feeder", label: "Feeder" }, { key: "float", label: "Plavaná" }];
const baits = [{ key: "corn", label: "Kukuřice" }, { key: "worms", label: "Červi" }];
const trip = () => ({ id: "autofill-trip", ownerId: "owner", startedAt: "2026-11-08T08:00:00Z", updatedAt: "2026-11-08T08:00:00Z",
  methodKey: "feeder", baitKeys: ["corn"], waterId: "water", locationName: "Pod jezem", waterDepthM: 3, bottomType: "gravel",
  waterTemperatureMeasurement: { valueC: 12, measuredAt: "2026-11-08T08:10:00Z", source: "manual_trip" }, sync: { revision: 2 } });
const waters = [{ id: "water", ownerId: "owner", name: "Moje řeka", waterNumber: "123456" }];
async function capture(options = {}, inputSource = "camera") {
  return prepareQuickCatch(blob, createQuickCapture(inputSource, new Date(at)), {
    prepare: async () => ({ blob, type: blob.type, size: blob.size, sha256: await sha256Blob(blob) }),
    readMetadata: async () => null, methods, baits, waters, ownerId: "owner", ...options });
}

test("complete Trip context fills canonical editor fields without inventing fish measurements or outcome", async () => {
  const record = await capture({ trip: trip() });
  assert.equal(record.waterId, "water"); assert.equal(record.waterNumber, 123456);
  assert.equal(record.locationName, "Pod jezem"); // Saved water name cannot replace a specific spot.
  assert.equal(record.method.key, "feeder"); assert.equal(record.baits[0].key, "corn");
  assert.equal(record.waterDepthM, 3); assert.equal(record.bottomType, "gravel");
  assert.equal(record.conditions.waterTempC, 12); assert.ok(record.conditions.moonPhase);
  assert.equal(record.quickCatch.provenance.waterTempC, "active_trip");
  assert.equal(record.quickCatch.tripSnapshot.revision, 2);
  for (const key of ["lengthCm", "weightKg", "girthCm", "fightMinutes"]) assert.equal(record[key], null);
  assert.equal(record.result, "unspecified"); assert.equal(record.isFavorite, false);
  const form = catchToForm(record);
  assert.equal(form.depthM, 3); assert.equal(form.bottomType, "gravel"); assert.equal(form.conditions.waterTempC, 12);
  assert.equal(form.fishingMethod, "feeder"); assert.deepEqual(form.baits, ["corn"]);
  assert.deepEqual(quickCatchMetadataFromRemote(quickCatchMetadataToRemote(record.quickCatch)), record.quickCatch);
});

test("future catches snapshot changed Trip defaults, while old catches retain their original context", async () => {
  const original = trip(); const first = await capture({ trip: original });
  original.methodKey = "float"; original.baitKeys = ["worms"]; original.waterDepthM = 1;
  original.waterTemperatureMeasurement.valueC = 14; original.sync.revision++;
  const second = await capture({ trip: original });
  assert.equal(first.method.key, "feeder"); assert.equal(first.baits[0].key, "corn"); assert.equal(first.waterDepthM, 3);
  assert.equal(first.conditions.waterTempC, 12); assert.equal(first.quickCatch.tripSnapshot.waterTemperatureMeasurement.valueC, 12);
  assert.equal(second.method.key, "float"); assert.equal(second.baits[0].key, "worms"); assert.equal(second.waterDepthM, 1);
  assert.equal(second.quickCatch.tripSnapshot.revision, 3);
});

test("no Trip, foreign Trip and gallery imports do not inherit today's defaults", async () => {
  const historical = { capturedAt: "2026-01-01T10:00:00Z", coordinates: { latitude: 50, longitude: 14 } };
  for (const record of [await capture(), await capture({ trip: { ...trip(), ownerId: "other" } }),
    await capture({ trip: trip(), readMetadata: async () => historical }, "gallery"),
    await capture({ trip: trip(), readMetadata: async () => ({ capturedAt: at }) }, "gallery")]) {
    assert.equal(record.tripId, null); assert.equal(record.waterId, null); assert.equal(record.method, null);
    assert.deepEqual(record.baits, []); assert.equal(record.waterDepthM, null);
  }
  const camera = await capture({ trip: trip(), readMetadata: async () => historical });
  assert.equal(camera.caughtAt, "2026-01-01T10:00:00.000Z"); assert.equal(camera.tripId, null);
  assert.equal(camera.gpsSource, "photo-exif");
});

test("Trip water temperature respects four-hour freshness, zero, and preserves stale observation separately", async () => {
  for (const [time, relevant] of [["2026-11-08T05:00:42Z", true], ["2026-11-08T05:00:41Z", false], ["2026-11-08T09:01:00Z", false]]) {
    const session = trip(); session.waterTemperatureMeasurement = { valueC: 0, measuredAt: time, source: "manual_trip" };
    const record = await capture({ trip: session });
    assert.equal(isTripWaterTemperatureRelevant(session.waterTemperatureMeasurement, at), relevant);
    assert.equal(record.conditions.waterTempC, relevant ? 0 : undefined);
    assert.equal(record.quickCatch.tripSnapshot.waterTemperatureMeasurement.valueC, 0);
    assert.ok(buildCatchEnvironmentPresentation(record).water.some(([label]) => label.includes("vycházky")));
  }
});

test("ordinary notes edit retains inherited/EXIF provenance and full automatic metadata; manual corrections win", async () => {
  const record = await capture({ trip: trip(), readMetadata: async () => ({ capturedAt: at, coordinates: { latitude: 50, longitude: 14 } }) });
  record.quickCatch.environment.conditions = { humidityPct: 70, precipitationMm: 0 };
  const edited = createCatchRecord({ ...catchToForm(record), notes: "Opravená poznámka" }, { key: "", label: record.species }, methods, record, baits);
  assert.equal(edited.caughtAt, at); assert.deepEqual(edited.quickCatch.environment, record.quickCatch.environment);
  for (const field of ["waterId", "method", "baits", "waterDepthM", "bottomType", "coordinates", "caughtAt", "waterTempC"])
    assert.equal(edited.quickCatch.provenance[field], record.quickCatch.provenance[field]);
  const form = catchToForm(edited); form.depthM = 1; form.fishingMethod = "float"; form.conditions.waterTempC = 15;
  const manual = createCatchRecord(form, { key: "commonCarp", label: "Kapr obecný" }, methods, edited, baits);
  assert.equal(manual.quickCatch.provenance.waterDepthM, "manual"); assert.equal(manual.quickCatch.provenance.method, "manual");
  assert.equal(manual.quickCatch.provenance.waterTempC, "manual"); assert.equal(manual.quickCatch.provenance.speciesKey, "manual");
  assert.equal(manual.conditions.waterTempC, 15);
});

test("full and legacy editor extended weather fields round-trip through the same environment normalizer", async () => {
  const quick = await capture(); const form = { ...catchToForm(quick), environmentConditions: { humidityPct: 75, precipitationMm: 0 } };
  const normal = createCatchRecord(form, { key: "commonCarp", label: "Kapr obecný" }, methods);
  assert.equal(normal.quickCatch, undefined); assert.deepEqual(normal.environment.conditions, form.environmentConditions);
  const edited = createCatchRecord({ ...catchToForm(normal), notes: "Jiná poznámka" }, { key: normal.speciesKey, label: normal.species }, methods, normal);
  assert.deepEqual(edited.environment, normal.environment);
});

test("bounded pre-camera GPS persists per catch; stale evidence and historical photos never borrow a new position", async () => {
  const evidence = { source: "live-gps", capturedAt: at, accuracyMeters: 8, coordinates: { latitude: 50, longitude: 14 } };
  const current = await capture({ locationEvidence: evidence });
  assert.deepEqual(current.coordinates, evidence.coordinates); assert.equal(current.locationEvidence.accuracyMeters, 8);
  for (const record of [await capture({ locationEvidence: { ...evidence, capturedAt: "2026-11-08T08:59:41Z" } }),
    await capture({ locationEvidence: evidence, readMetadata: async () => ({ capturedAt: "2025-01-01T10:00:00Z" }) }, "gallery")]) assert.equal(record.coordinates, null);
  const manual = createCatchRecord({ ...catchToForm(current), coordinates: null, gpsLocation: "", gpsSource: "manual", locationEvidence: null },
    { key: "", label: current.species }, methods, current, baits);
  assert.equal(manual.coordinates, null); assert.equal(manual.locationEvidence, null);
  assert.equal(manual.quickCatch.provenance.coordinates, "manual");
});

test("private fallback and explicit scoped privacy defaults survive durable local reopen with Trip snapshot", async () => {
  const privateRecord = await capture({ privacyDefaults: { hasSavedSettings: true, defaultCatchVisibility: "public" } });
  assert.equal(privateRecord.privacy.visibility, "private"); assert.equal(privateRecord.privacy.photoVisibility, "private");
  const shared = await capture({ trip: trip(), privacyDefaults: { ownerId: "owner", hasSavedSettings: true, defaultCatchVisibilityExplicit: true,
    defaultCatchVisibility: "public", defaultPhotoVisibility: "private", privateSpotDefault: true, defaultLocationPrecision: "exact" } });
  assert.equal(shared.privacy.visibility, "public"); assert.equal(shared.privacy.locationPrecision, "none");
  const scope = { scopeKey: "account:owner", ownerId: "owner" };
  await tripRepository.put({ ...trip(), title: "Izolovaný test" }, scope);
  await persistQuickCatch(shared, scope, catchRepository);
  const restored = await catchRepository.get(shared.id, scope);
  assert.deepEqual(restored.quickCatch.tripSnapshot, shared.quickCatch.tripSnapshot);
  assert.equal(restored.photos[0].blob.size, blob.size); assert.deepEqual(restored.privacy, shared.privacy);
});
