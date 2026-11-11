import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("public progression renders provenance, private gaps and safe approved projections", async t => {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [], entries: [] } });
  try {
    const { PublicAchievements, PublicProgressionSummary, PublicStatistics, PublicTrophies } = await server.ssrLoadModule("/src/features/social/components/PublicProgression.jsx");
    const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
    await t.test("only server-confirmed XP are presented as confirmed progression", () => {
      const trusted = render(PublicProgressionSummary, { progression: { source: "server", level: 4, xp: 450, rank: "Nováček", version: 1 } });
      assert.match(trusted, /450 XP/); assert.match(trusted, /serverem potvrzených událostí/);
      assert.equal(render(PublicProgressionSummary, { progression: { source: "legacy", level: 99, xp: 999999 } }), "");
      assert.equal(render(PublicProgressionSummary, {}), "");
    });
    await t.test("unverified awards never claim server confirmation or a verified unlock date", () => {
      const html = render(PublicAchievements, { achievements: [{ id: "first-catch", title: "První úlovek", description: "Záznam rybáře", category: "Úlovky", source: "unverified", xp: 30, unlockedAt: "2026-01-02T10:00:00Z" }] });
      assert.match(html, /Nahlášený úspěch · server neověřil/); assert.match(html, /Standardní odměna: 30 XP/);
      assert.doesNotMatch(html, /Splněno · potvrzeno serverem|2\. 1\. 2026/);
    });
    await t.test("unearned hidden awards are not rendered and descriptions are escaped", () => {
      const html = render(PublicAchievements, { achievements: [{ id: "hidden", title: "SECRET-UNREVEALED", description: "SECRET-RULE", category: "SECRET-CATEGORY", unlocked: false },
        { id: "public", title: "První úlovek", description: "<script>alert(1)</script>", category: "Úlovky", source: "unverified", xp: 30 }] });
      assert.doesNotMatch(html, /SECRET|<script>/); assert.match(html, /&lt;script&gt;/);
    });
    await t.test("shared statistics state their limited scope without exposing source fields", () => {
      const html = render(PublicStatistics, { statistics: { catchCount: 2, speciesCount: 1, longestCm: 53, heaviestKg: null, partial: true,
        speciesCounts: [{ species: "Kapr", count: 2 }], privateGps: "SECRET-GPS", sourceCatchId: "SECRET-ID" } });
      assert.match(html, /výběr z omezené části záznamů/); assert.match(html, /53 cm/);
      assert.doesNotMatch(html, /SECRET|Nejtěžší/);
    });
    await t.test("coarse trophy dates retain their precision and no private drilldown is created", () => {
      const html = render(PublicTrophies, { trophies: [{ id: "opaque-public-id", species: "Kapr", lengthCm: 53, caughtAt: "2026-11", gps: "SECRET-GPS", catchId: "SECRET-SOURCE" }] });
      assert.match(html, /2026-11/); assert.doesNotMatch(html, /SECRET|href=|1\. 11\./);
    });
  } finally { await server.close(); }
});
