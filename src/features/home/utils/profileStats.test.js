import test from "node:test";
import assert from "node:assert/strict";
import { getAvailableProfileStats, getReleasedPercentage } from "./profileStats.js";

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
    { weightKg: 2.4, result: "kept", method: { key: "feeder", label: "Feeder" }, locationName: "Lipno" },
    { weightKg: null, result: "unspecified", method: null, locationName: "" },
  ]);

  assert.deepEqual(stats.map(({ key, value }) => [key, value]), [
    ["record", "2.4 kg"],
    ["method", "1×"],
    ["location", "1×"],
    ["released", "0%"],
  ]);
});
