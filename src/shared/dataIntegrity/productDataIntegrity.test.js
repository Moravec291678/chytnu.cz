import test from "node:test";
import assert from "node:assert/strict";
import { auditProductDataIntegrity, validateProductDataIntegrity } from "./productDataIntegrity.js";

test("reports duplicate IDs across domain and progression records", () => {
  const issues = validateProductDataIntegrity({
    catches: [{ id: "c1", caughtAt: "2026-01-01T12:00:00Z" }, { id: "c1", caughtAt: "2026-01-02T12:00:00Z" }],
    rewardEvents: [{ id: "r1" }, { id: "r1" }],
  });
  assert.deepEqual(issues.filter((issue) => issue.code === "duplicate-id").map((issue) => issue.collection), ["catches", "progression-rewards"]);
});

test("reports missing Catch references without changing the supplied data", () => {
  const catchRecord = { id: "c1", tripId: "gone-trip", waterId: "gone-water", caughtAt: "2026-01-01T12:00:00Z" };
  const issues = validateProductDataIntegrity({ catches: [catchRecord], trips: [], waters: [] });
  assert.deepEqual(issues.filter((issue) => issue.code === "missing-reference").map((issue) => issue.field), ["tripId", "waterId"]);
  assert.equal(catchRecord.tripId, "gone-trip");
});

test("reports invalid dates, coordinates, and verification levels", () => {
  const issues = validateProductDataIntegrity({
    catches: [{ id: "c1", caughtAt: "not-a-date", coordinates: { latitude: 91, longitude: 181 }, verification: { level: "super" } }],
    waters: [{ id: "w1", coordinates: { latitude: 40, longitude: Number.NaN } }],
    trips: [{ id: "t1", startedAt: "2026-04-02", endedAt: "2026-04-01" }],
  });
  assert.deepEqual(new Set(issues.map((issue) => issue.code)), new Set(["invalid-date", "invalid-coordinates", "invalid-verification-level", "invalid-date-order"]));
});

test("reports malformed challenge definitions", () => {
  const issues = validateProductDataIntegrity({ challenges: [
    { id: "x", title: "", goal: 0, progress: 1, xp: -1 },
    { id: "x", title: "OK", goal: 2, progress: 0, xp: 5 },
  ] });
  assert.deepEqual(issues.map((issue) => issue.code), ["invalid-challenge-config", "duplicate-id"]);
});

test("generated challenge configuration has valid unique IDs and progress values", () => {
  const issues = auditProductDataIntegrity({ catches: [], trips: [], waters: [], rewardEvents: [], now: new Date("2026-10-28T12:00:00Z") });
  assert.deepEqual(issues, []);
});
