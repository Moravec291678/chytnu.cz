import test from "node:test";
import assert from "node:assert/strict";
import { buildInsights, buildSeasonStory, buildYearSummary } from "./retrospectives.js";

const catchRecord = (patch = {}) => ({ caughtAt: "2026-05-01T08:00:00", species: "Kapr", speciesKey: "carp", weightKg: null, lengthCm: null, method: null, baits: [], ...patch });

test("insights show only patterns supported by at least three records", () => {
  const rows = [1, 2, 3].map((n) => catchRecord({ id: n, method: { key: "float", label: "Plavaná" } }));
  const insights = buildInsights(rows);
  assert.equal(insights.find((item) => item.key === "method").value, "Plavaná");
  assert.equal(buildInsights(rows.slice(0, 2)).find((item) => item.key === "method").value, null);
});

test("year summary uses only the selected year and measured personal bests", () => {
  const result = buildYearSummary([catchRecord({ weightKg: 4 }), catchRecord({ caughtAt: "2025-01-01", weightKg: 90 })], [], 2026);
  assert.equal(result.catches, 1); assert.equal(result.biggest.weightKg, 4); assert.equal(result.species, 1);
});

test("season story derives counts, waters and biggest catch from local records", () => {
  const result = buildSeasonStory([catchRecord({ locationName: "Labe", weightKg: 7 })], [], 2026);
  assert.equal(result.catches, 1); assert.equal(result.waterCount, 1); assert.equal(result.biggest.weightKg, 7);
});
