import test from "node:test";
import assert from "node:assert/strict";
import { getAvailableProfileStats, getBestWater, getBiggestCatch, getReleasedPercentage } from "./profileStats.js";

test("release percentage uses only records with a known outcome", () => {
  assert.equal(getReleasedPercentage([{ result: "released" }, { result: "kept" }, { result: "unspecified" }]), 50);
  assert.equal(getReleasedPercentage([{ result: "unspecified" }]), null);
});

test("profile summary omits statistics whose source data is missing", () => {
  assert.deepEqual(getAvailableProfileStats([]), []);
  assert.deepEqual(getAvailableProfileStats([{
    weightKg: null,
    result: "unspecified",
    method: null,
    locationName: "",
  }]), []);
});

test("profile summary shows only measured or explicitly recorded statistics", () => {
  const stats = getAvailableProfileStats([
    { weightKg: 2.4, lengthCm: 82, result: "kept", method: { key: "feeder", label: "Feeder" }, locationName: "Lipno" },
    { weightKg: null, result: "unspecified", method: null, locationName: "" },
  ]);

  assert.deepEqual(stats.map(({ key, value }) => [key, value]), [
    ["record", "82 cm · 2,4 kg"],
    ["method", "1×"],
    ["location", "1×"],
    ["released", "0%"],
  ]);
});

test("best Water is derived only from catches linked to a stable Water ID", () => {
  const best = getBestWater([
    { id: "a", waterId: "lipno", locationName: "Starý název" },
    { id: "b", waterId: "lipno", locationName: "Starý název" },
    { id: "c", locationName: "Volný text bez Water ID" },
    { id: "d", waterId: "other", locationName: "Řeka" },
  ], [{ id: "lipno", name: "Lipno" }]);

  assert.deepEqual({ id: best.id, name: best.name, catchCount: best.catchCount, water: best.water.name }, {
    id: "lipno", name: "Lipno", catchCount: 2, water: "Lipno",
  });
});

test("future Catch remains data but cannot become the displayed personal record", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");
  const future = { id: "future", caughtAt: "2026-10-29T10:00:00.000Z", weightKg: 100, weightSource: "manual" };
  const current = { id: "current", caughtAt: "2026-10-28T10:00:00.000Z", weightKg: 5, weightSource: "manual" };
  assert.equal(getBiggestCatch([current, future], now), current);
  assert.equal(getBiggestCatch([future], now), null);
});

test("best Water is absent when there is no linked, named catch", () => {
  assert.equal(getBestWater([{ locationName: "Labe" }], []), null);
  assert.equal(getBestWater([{ waterId: "missing" }], []), null);
  assert.equal(getBestWater([{ waterId: "deleted", locationName: "Smazaný revír" }], []), null);
});
