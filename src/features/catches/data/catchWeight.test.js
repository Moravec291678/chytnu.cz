import test from "node:test";
import assert from "node:assert/strict";
import { formatCatchMeasurements, formatCatchWeight } from "./catchWeight.js";

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
