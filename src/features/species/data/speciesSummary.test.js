import test from "node:test";
import assert from "node:assert/strict";
import { selectSpeciesHighlight } from "./speciesSummary.js";

test("species highlight selects the heaviest measured catch even when the newest catch has no weight", () => {
  const unmeasured = { id: "new", weightKg: null };
  const smaller = { id: "small", weightKg: 2.5 };
  const largest = { id: "large", weightKg: 7.2 };
  assert.equal(selectSpeciesHighlight([unmeasured, smaller, largest]), largest);
});

test("species highlight falls back to the first catch only when no weight is known", () => {
  const first = { id: "first", weightKg: null };
  assert.equal(selectSpeciesHighlight([first, { id: "second", weightKg: null }]), first);
  assert.equal(selectSpeciesHighlight([]), null);
});
