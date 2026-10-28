import test from "node:test";
import assert from "node:assert/strict";
import { compareCatchSize, selectBestCatch } from "./catchSize.js";

test("catch size comparison prioritizes length, then measured weight on ties", () => {
  const longest = { id: "longest", lengthCm: 100 };
  const heavier = { id: "heavier", lengthCm: 90, weightKg: 10, weightSource: "manual" };
  assert.ok(compareCatchSize(longest, heavier) > 0);
  assert.equal(selectBestCatch([heavier, longest]), longest);
  assert.ok(compareCatchSize(
    { lengthCm: 100, weightKg: 9, weightSource: "manual" },
    { lengthCm: 100, weightKg: 8, weightSource: "manual" },
  ) > 0);
});

test("estimated weight cannot beat a measured weight record and weight-only legacy rows remain comparable", () => {
  const measured = { id: "measured", weightKg: 5, weightSource: "manual" };
  const estimated = { id: "estimated", weightKg: 100, weightSource: "estimated" };
  assert.equal(selectBestCatch([estimated, measured]), measured);
  assert.equal(selectBestCatch([{ id: "no-measure" }, measured]), measured);
});
