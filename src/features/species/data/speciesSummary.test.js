import test from "node:test";
import assert from "node:assert/strict";
import { selectSpeciesHighlight } from "./speciesSummary.js";

test("species highlight prioritizes length over a shorter heavier catch", () => {
  const unmeasured = { id: "new" };
  const smaller = { id: "small", weightKg: 2.5 };
  const longest = { id: "long", lengthCm: 100 };
  const heavier = { id: "large", lengthCm: 70, weightKg: 7.2, weightSource: "manual" };
  assert.equal(selectSpeciesHighlight([unmeasured, heavier, smaller, longest]), longest);
});

test("species highlight falls back to the first catch only when no weight is known", () => {
  const first = { id: "first", weightKg: null };
  assert.equal(selectSpeciesHighlight([first, { id: "second", weightKg: null }]), first);
  assert.equal(selectSpeciesHighlight([]), null);
});
