import test from "node:test";
import assert from "node:assert/strict";
import { formatCatchMeasurements, formatCatchWeight, getCatchMeasurementLabels } from "./catchWeight.js";

test("catch measurements show length before weight and preserve estimated weight marker", () => {
  assert.equal(formatCatchMeasurements({ lengthCm: 82, weightKg: 7.4 }), "82 cm · 7,4 kg");
  assert.equal(formatCatchMeasurements({ lengthCm: 82, weightKg: 7.4, weightSource: "estimated" }), "82 cm · ≈ 7,4 kg");
});

test("catch measurements show whichever measurement is available", () => {
  assert.equal(formatCatchMeasurements({ lengthCm: 82, weightKg: null }), "82 cm");
  assert.equal(formatCatchMeasurements({ lengthCm: null, weightKg: 7.4 }), "7,4 kg");
  assert.equal(formatCatchMeasurements({ lengthCm: null, weightKg: null }), "");
  assert.equal(formatCatchWeight({ weightKg: 7.4 }), "7,4");
});

test("display labels preserve zero and the weight source without modifying the record", () => {
  const record = Object.freeze({ lengthCm: 0, weightKg: 0, weightSource: "estimated", xp: 123 });
  assert.deepEqual(getCatchMeasurementLabels(record), { length: "0 cm", weight: "≈ 0 kg", estimated: true });
  assert.deepEqual(getCatchMeasurementLabels({ lengthCm: NaN, weightKg: 7.25 }), { length: null, weight: "7,25 kg", estimated: false });
  assert.deepEqual(getCatchMeasurementLabels({ lengthCm: "0", weightKg: null }), { length: null, weight: null, estimated: false });
  assert.deepEqual(record, { lengthCm: 0, weightKg: 0, weightSource: "estimated", xp: 123 });
});
