import test from "node:test";
import assert from "node:assert/strict";
import { getCatchRecognition, isNewLengthRecord } from "./catchDetail.js";

const catchRecord = (id, extra = {}) => ({
  id,
  speciesKey: "carp",
  species: "Kapr obecný",
  caughtAt: "2026-10-17T06:40:00",
  weightKg: 6.8,
  locationName: "Rybník Dubový",
  ...extra,
});

test("catch recognition derives PB, species, season and new-water badges from real journal rows", () => {
  const current = catchRecord("current");
  const history = [
    catchRecord("older-carp", { weightKg: 5.9, caughtAt: "2026-10-10T08:00:00" }),
    catchRecord("other-water", { speciesKey: "pike", species: "Štika", caughtAt: "2026-07-12T08:00:00", weightKg: 5.4, locationName: "Řeka" }),
    catchRecord("past-season", { caughtAt: "2026-07-10T08:00:00", weightKg: 5.2 }),
  ];
  const recognition = getCatchRecognition(current, [current, ...history]);
  assert.deepEqual({
    personalBest: recognition.personalBest,
    speciesRecord: recognition.speciesRecord,
    seasonRecord: recognition.seasonRecord,
    newLocation: recognition.newLocation,
  }, {
    personalBest: true,
    speciesRecord: true,
    seasonRecord: true,
    newLocation: false,
  });
  assert.ok(Math.abs(recognition.personalBestDelta - 0.9) < 1e-9);
});

test("catch recognition stays honest without measurement, location, or historical matches", () => {
  const current = catchRecord("current", { weightKg: null, locationName: "" });
  assert.deepEqual(getCatchRecognition(current, [current]), {
    personalBest: false,
    personalBestDelta: null,
    speciesRecord: false,
    seasonRecord: false,
    newLocation: false,
  });
});

test("only strictly larger later catches break an existing best; equal weights remain recognized", () => {
  const current = catchRecord("current");
  const older = catchRecord("older", { weightKg: 6.8, caughtAt: "2026-10-01T08:00:00" });
  const recognition = getCatchRecognition(current, [current, older]);
  assert.equal(recognition.personalBest, true);
  assert.equal(recognition.personalBestDelta, 0);
  assert.equal(recognition.speciesRecord, true);
  assert.equal(recognition.newLocation, false);
});

test("length badges are shown only for an actual new length record", () => {
  const current = catchRecord("current", { lengthCm: 75 });
  assert.equal(isNewLengthRecord(current, [current]), true);
  assert.equal(isNewLengthRecord(current, [current, catchRecord("shorter", { lengthCm: 74 })]), true);
  assert.equal(isNewLengthRecord(current, [current, catchRecord("tie", { lengthCm: 75 })]), false);
  assert.equal(isNewLengthRecord({ ...current, lengthCm: null }, [current]), false);
});

test("future catches and future records cannot earn catch-recognition badges", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");
  const future = catchRecord("future", { caughtAt: "2026-10-29T10:00:00.000Z", lengthCm: 120, weightKg: 30 });
  const current = catchRecord("current", { caughtAt: "2026-10-28T10:00:00.000Z", lengthCm: 80, weightKg: 5 });
  assert.deepEqual(getCatchRecognition(future, [current, future], now), {
    personalBest: false, personalBestDelta: null, speciesRecord: false, seasonRecord: false, newLocation: false,
  });
  assert.equal(isNewLengthRecord(future, [current, future], now), false);
  assert.equal(isNewLengthRecord(current, [current, future], now), true);
});
