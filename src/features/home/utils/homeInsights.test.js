import test from "node:test";
import assert from "node:assert/strict";
import { buildHomeInsight } from "./homeInsights.js";
test("Home compatibility object keeps actual evidence and a concrete experiment, never a single-value popularity tip", () => {
  const result = buildHomeInsight([{ id: "only", caughtAt: "2026-10-01T10:00:00Z", speciesKey: "commonCarp", lengthCm: 60 }]);
  assert.equal(result.isInsight, false);
  assert.equal(result.basedOnRecords, 1);
  assert.match(result.message, /1 záznam/);
  assert.match(result.experiment, /dvě stejně dlouhé části/);
  assert.deepEqual(result.evidenceIds, ["only"]);
});
test("unusable dates and missing identities are not counted as personalization evidence", () => {
  const result = buildHomeInsight([{ method: { key: "feeder" } }, { id: "bad", caughtAt: "invalid" }]);
  assert.equal(result.basedOnRecords, 0);
  assert.deepEqual(result.evidenceIds, []);
});
