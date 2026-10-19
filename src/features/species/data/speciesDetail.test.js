import assert from "node:assert/strict";
import test from "node:test";
import { getSpeciesDetail } from "./speciesDetail.js";

const makeCatch = (id, speciesKey, caughtAt, weightKg, lengthCm) => ({
  id,
  speciesKey,
  caughtAt,
  weightKg,
  lengthCm,
});

test("species detail derives count, ordering, and independent size records from matching catches", () => {
  const carpOld = makeCatch("carp-old", "commonCarp", "2025-01-01", 12, 70);
  const pike = makeCatch("pike", "pike", "2025-03-01", 20, 80);
  const carpNew = makeCatch("carp-new", "commonCarp", "2025-02-01", 8, 95);
  const detail = getSpeciesDetail([carpOld, pike, carpNew], "commonCarp");

  assert.deepEqual(detail.catches.map(({ id }) => id), ["carp-new", "carp-old"]);
  assert.equal(detail.biggestCatch, carpOld);
  assert.equal(detail.longestCatch, carpNew);
  assert.equal(detail.personalRecord, pike);
});

test("species detail has no records or fake catches without matching data", () => {
  const detail = getSpeciesDetail([
    makeCatch("pike", "pike", "2025-03-01", 20, 80),
  ], "commonCarp");

  assert.deepEqual(detail.catches, []);
  assert.equal(detail.biggestCatch, null);
  assert.equal(detail.longestCatch, null);
  assert.equal(detail.personalRecord.id, "pike");
});

test("species detail tolerates catches without measured values", () => {
  const detail = getSpeciesDetail([
    makeCatch("unmeasured", "commonCarp", "2025-03-01", null, null),
  ], "commonCarp");

  assert.equal(detail.catches.length, 1);
  assert.equal(detail.biggestCatch, null);
  assert.equal(detail.longestCatch, null);
});
