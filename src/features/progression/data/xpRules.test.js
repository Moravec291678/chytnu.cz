import test from "node:test";
import assert from "node:assert/strict";
import { applyCatchVerificationMultiplier, calculateLimitedCatchXpForDay, XP_RULES } from "./xpRules.js";

test("Catch verification XP multipliers preserve full verified awards and zero unverified XP", () => {
  for (const level of ["strong", "standard"]) {
    assert.equal(applyCatchVerificationMultiplier(XP_RULES.catch.base, level), 10);
    assert.equal(applyCatchVerificationMultiplier(XP_RULES.catch.photo, level), 15);
    assert.equal(applyCatchVerificationMultiplier(XP_RULES.catch.gpsAndWeather, level), 20);
  }
  assert.equal(applyCatchVerificationMultiplier(20, "unverified"), 0);
});

test("limited XP uses a 25 percent multiplier with deterministic Math.round", () => {
  assert.equal(applyCatchVerificationMultiplier(10, "limited"), 3);
  assert.equal(applyCatchVerificationMultiplier(15, "limited"), 4);
  assert.equal(applyCatchVerificationMultiplier(20, "limited"), 5);
  assert.equal(applyCatchVerificationMultiplier(-10, "limited"), 0);
  assert.equal(applyCatchVerificationMultiplier(10, "unknown"), 0);
});

test("limited daily cap counts only rewards created on the current Prague day", () => {
  const events = [
    { type: "catch.limited", xp: 18, createdAt: "2026-10-28T12:00:00.000Z" },
    { type: "catch.limited", xp: 20, createdAt: "2026-10-27T12:00:00.000Z" },
    { type: "catch.created", xp: 10, createdAt: "2026-10-28T12:00:00.000Z" },
  ];
  assert.equal(calculateLimitedCatchXpForDay(15, events, "2026-10-28T13:00:00.000Z"), 2);
  assert.equal(calculateLimitedCatchXpForDay(15, events, "2026-10-29T00:00:00.000Z"), 4);
  assert.equal(calculateLimitedCatchXpForDay(15, events, "invalid"), 0);
});
