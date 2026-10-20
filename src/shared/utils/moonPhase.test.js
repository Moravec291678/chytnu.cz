import test from "node:test";
import assert from "node:assert/strict";
import { calculateMoonPhase } from "./moonPhase.js";

test("moon phase calculator is deterministic and validates local date/time", () => {
  assert.equal(calculateMoonPhase("2000-01-06", "12:00"), "new");
  assert.equal(calculateMoonPhase("not-a-date", "12:00"), null);
  assert.equal(calculateMoonPhase("2026-02-30", "12:00"), null);
  assert.equal(calculateMoonPhase("2026-10-20", "25:61"), null);
});
