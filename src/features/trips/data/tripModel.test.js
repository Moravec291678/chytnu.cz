import test from "node:test";
import assert from "node:assert/strict";
import { createTripRecord, endTripRecord, formatTripDuration, getActiveTrip, getTripDurationMs, tripToForm, updateTripRecord } from "./tripModel.js";

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
  assert.match(trip.title, /Výprava/);
  assert.equal(getActiveTrip([trip]), trip);
  assert.equal(getActiveTrip([ended]), null);
  assert.equal(ended.sync.revision, trip.sync.revision + 1);
  assert.equal(getTripDurationMs(ended), 9_300_000);
  assert.equal(formatTripDuration(9_300_000), "2 h 35 min");
});
