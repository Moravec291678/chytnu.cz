import test from "node:test";
import assert from "node:assert/strict";
import { buildHomeInsight } from "./homeInsights.js";

test("insights avoid claiming patterns from a small sample", () => {
  const insight = buildHomeInsight(Array.from({ length: 4 }, () => ({ method: { key: "spin", label: "Přívlač" } })));
  assert.equal(insight.isInsight, false);
  assert.equal(insight.basedOnRecords, 4);
  assert.match(insight.message, /dalšími záznamy/);
});

test("a supported method pattern names its real numerator and denominator", () => {
  const insight = buildHomeInsight([
    ...Array.from({ length: 4 }, () => ({ method: { key: "spin", label: "Přívlač" } })),
    { method: { key: "float", label: "Plavaná" } },
  ]);
  assert.equal(insight.isInsight, true);
  assert.match(insight.message, /Přívlač.*4 z 5/);
});

test("missing method data yields a practical tip, not a fabricated insight", () => {
  assert.equal(buildHomeInsight(Array.from({ length: 5 }, () => ({}))).isInsight, false);
});
