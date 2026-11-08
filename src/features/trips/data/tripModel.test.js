import test from "node:test";
import assert from "node:assert/strict";
import { createTripRecord, endTripRecord, formatTripCatchCount, formatTripDuration, getActiveTrip, getDistinctTripSpecies, getTripCatchRatePerHour, getTripDurationMs, normalizeTripDefaults, tripToForm, updateTripRecord } from "./tripModel.js";

test("trip records store stable local metadata and optional fields", () => {
  const now = new Date("2026-10-16T12:30:00.000Z");
  const trip = createTripRecord({ title: " Večerní výprava ", locationName: "Labe", methodKey: "feeder" }, now);
  assert.equal(trip.title, "Večerní výprava");
  assert.equal(trip.startedAt, now.toISOString());
  assert.equal(trip.endedAt, null);
  assert.equal(trip.locationName, "Labe");
  assert.equal(trip.sync.status, "local");
});

test("editing trip fields retains identity, ownership, history and timestamps", () => {
  const trip = { ...createTripRecord({ title: "Ranní" }, new Date("2026-10-16T12:00:00.123Z")), ownerId: "angler", notes: "Zachovat" };
  const updated = updateTripRecord(trip, { ...tripToForm(trip), title: " Večerní ", locationName: " Labe ", methodKey: "feeder" }, new Date("2026-10-17T12:00:00Z"));
  assert.equal(updated.id, trip.id);
  assert.equal(updated.ownerId, trip.ownerId);
  assert.equal(updated.createdAt, trip.createdAt);
  assert.equal(updated.startedAt, trip.startedAt);
  assert.equal(updated.endedAt, null);
  assert.equal(updated.notes, "Zachovat");
  assert.equal(updated.title, "Večerní");
  assert.equal(updated.locationName, "Labe");
  assert.equal(updated.sync.revision, 2);
});

test("trip edit rejects invalid dates and reversed duration and keeps completed status", () => {
  const active = createTripRecord({}, new Date("2026-10-16T12:00:00Z"));
  const ended = endTripRecord(active, new Date("2026-10-16T14:00:00Z"));
  const values = tripToForm(ended);
  assert.throws(() => updateTripRecord(ended, { ...values, title: "" }), /název/);
  assert.throws(() => updateTripRecord(ended, { ...values, startedAt: "invalid" }), /začátek/);
  assert.throws(() => updateTripRecord(ended, { ...values, endedAt: "" }), /konec/);
  assert.throws(() => updateTripRecord(ended, { ...values, endedAt: "2026-10-15T00:00" }), /před začátkem/);
  const updated = updateTripRecord(ended, { ...values, endedAt: "2026-10-16T18:00:00Z" });
  assert.equal(updated.endedAt, "2026-10-16T18:00:00.000Z");
  assert.throws(() => endTripRecord(ended), /už byla ukončena/);
});

test("trip defaults title, ends durably, and elapsed duration uses stored timestamps", () => {
  const start = new Date("2026-10-16T12:00:00.000Z");
  const trip = createTripRecord({}, start);
  const ended = endTripRecord(trip, new Date("2026-10-16T14:35:00.000Z"));
  assert.match(trip.title, /Vycházka/);
  assert.equal(getActiveTrip([trip]), trip);
  assert.equal(getActiveTrip([ended]), null);
  assert.equal(ended.sync.revision, trip.sync.revision + 1);
  assert.equal(getTripDurationMs(ended), 9_300_000);
  assert.equal(formatTripDuration(9_300_000), "2 h 35 min");
});

test("trip catch rate uses actual catches and elapsed time", () => {
  assert.equal(getTripCatchRatePerHour(2, 10_800_000), 2 / 3);
  assert.equal(getTripCatchRatePerHour(0, 3_600_000), 0);
  assert.equal(getTripCatchRatePerHour(1, 0), null);
  assert.equal(getTripCatchRatePerHour(-1, 3_600_000), null);
  assert.equal(getTripCatchRatePerHour(1.5, 3_600_000), null);
});

test("catch totals use correct Czech plural forms", () => {
  assert.equal(formatTripCatchCount(1), "1 úlovek");
  assert.equal(formatTripCatchCount(3), "3 úlovky");
  assert.equal(formatTripCatchCount(7), "7 úlovků");
  assert.equal(formatTripCatchCount(12), "12 úlovků");
});

test("trip species are deduplicated by key, with a name fallback for legacy catches", () => {
  const catches = [
    { species: "Kapr obecný", speciesKey: "carp" },
    { species: "Kapr", speciesKey: "carp" },
    { species: "Štika" },
    { species: "", speciesKey: "ignored" },
  ];
  assert.deepEqual(getDistinctTripSpecies(catches), [catches[0], catches[2]]);
});

test("optional trip defaults survive edits and legacy trips remain compatible", () => {
  const trip = createTripRecord({ waterId: "water-1", baitKeys: ["worm", "worm", "corn"] }, new Date("2026-11-08T10:00:00Z"));
  assert.deepEqual(trip.baitKeys, ["worm", "corn"]);
  const updated = updateTripRecord(trip, { ...tripToForm(trip), title: "Pokus", baitKeys: ["corn"] }, new Date("2026-11-08T12:00:00Z"));
  assert.equal(updated.waterId, "water-1"); assert.deepEqual(updated.baitKeys, ["corn"]);
  const legacy = tripToForm({ title: "Starší", startedAt: "2026-01-01T10:00:00Z" });
  assert.equal(legacy.waterId, ""); assert.deepEqual(legacy.baitKeys, []);
  assert.throws(() => createTripRecord({ waterId: "../other" }));
  assert.throws(() => createTripRecord({ baitKeys: Array.from({ length: 6 }, (_, index) => `bait-${index}`) }));
});

test("trip environment defaults validate units and preserve measured zero rather than inventing missing values", () => {
  assert.deepEqual(normalizeTripDefaults({ waterDepthM: "3,5", bottomType: "gravel", waterTempC: "0", waterTempMeasuredAt: "2026-11-08T09:00:00Z" }), {
    waterId: null, baitKeys: [], waterDepthM: 3.5, bottomType: "gravel",
    waterTemperatureMeasurement: { valueC: 0, measuredAt: "2026-11-08T09:00:00.000Z", source: "manual_trip" },
  });
  const unknown = normalizeTripDefaults({ waterDepthM: " ", waterTempC: "" });
  assert.equal(unknown.waterDepthM, null); assert.equal(unknown.waterTemperatureMeasurement, null);
  for (const invalid of [{ waterDepthM: -1 }, { waterDepthM: 2001 }, { waterDepthM: true }, { waterDepthM: "abc" },
    { bottomType: "invented" }, { waterTempC: 61, waterTempMeasuredAt: "2026-11-08T09:00Z" },
    { waterTempC: "12" }, { waterTempC: "12", waterTempMeasuredAt: "invalid" },
    { waterTemperatureMeasurement: { valueC: 12, measuredAt: "2026-11-08T09:00Z", source: "weather_api" } },
    { waterTemperatureMeasurement: { valueC: 12, measuredAt: "2026-11-08T09:00Z", source: "manual_trip", extra: "untrusted" } }]) {
    assert.throws(() => normalizeTripDefaults(invalid));
  }
});

test("editing active trip environment changes future defaults without mutating the earlier snapshot and preserves exact measurement time", () => {
  const original = createTripRecord({ waterDepthM: 3, bottomType: "gravel", waterTempC: 12,
    waterTempMeasuredAt: "2026-10-25T02:30:00.123+01:00" }, new Date("2026-10-25T08:00:00Z"));
  const updated = updateTripRecord(original, { ...tripToForm(original), waterDepthM: 1, methodKey: "float", baitKeys: ["worm"] }, new Date("2026-10-25T10:00:00Z"));
  assert.equal(updated.waterDepthM, 1); assert.equal(original.waterDepthM, 3);
  assert.equal(updated.waterTemperatureMeasurement.measuredAt, "2026-10-25T01:30:00.123Z");
  assert.equal(updated.methodKey, "float"); assert.equal(original.methodKey, null);
  const oldClientValues = { title: original.title, locationName: "Nová lokalita", methodKey: "feeder", startedAt: tripToForm(original).startedAt, endedAt: "" };
  const retained = updateTripRecord(original, oldClientValues, new Date("2026-10-25T10:00:00Z"));
  assert.equal(retained.waterDepthM, 3); assert.deepEqual(retained.waterTemperatureMeasurement, original.waterTemperatureMeasurement);
  const cleared = updateTripRecord(updated, { ...tripToForm(updated), waterTempC: "", waterDepthM: "", bottomType: "" }, new Date("2026-10-25T11:00:00Z"));
  assert.equal(cleared.waterTemperatureMeasurement, null); assert.equal(cleared.waterDepthM, null); assert.equal(cleared.bottomType, null);
});

test("trip creation honors explicitly chosen start and refuses future starts or future measurements", () => {
  const now = new Date("2026-11-08T10:00:00Z");
  assert.equal(createTripRecord({ startedAt: "2026-11-08T08:00:00Z" }, now).startedAt, "2026-11-08T08:00:00.000Z");
  assert.throws(() => createTripRecord({ startedAt: "invalid" }, now));
  assert.throws(() => createTripRecord({ startedAt: "2026-11-08T11:00:00Z" }, now), /budoucnosti/);
  assert.throws(() => createTripRecord({ waterTempC: 12, waterTempMeasuredAt: "2026-11-08T11:00:00Z" }, now), /budoucnosti/);
});
