import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Home places Quick Catch, conditions, and current trip before progression extras", async () => {
  const source = await readFile(new URL("./HomePage.jsx", import.meta.url), "utf8");
  const quickCatch = source.indexOf("<QuickCatchButton />");
  const conditions = source.indexOf("<FishActivity />");
  const activeTrip = source.indexOf("{activeTrip && <ActiveTripSummary");
  const noTrip = source.indexOf("className=\"home-no-trip\"");
  const progression = source.indexOf("className=\"home-progress-card home-xp-card\"");
  const seasonalChallenge = source.indexOf("<SeasonalChallengeCard");
  assert.ok(quickCatch >= 0 && quickCatch < conditions);
  assert.ok(conditions < activeTrip && activeTrip < progression);
  assert.ok(activeTrip < noTrip && noTrip < progression);
  assert.ok(progression < seasonalChallenge);
});

test("Home keeps one Journal entry and avoids repeating its section tabs", async () => {
  const source = await readFile(new URL("./HomePage.jsx", import.meta.url), "utf8");
  const journal = await readFile(new URL("./JournalPage.jsx", import.meta.url), "utf8");
  assert.match(source, /<Link to="\/journal">Vše/);
  assert.doesNotMatch(source, /dashboard-view-tabs|dashboard-view-tab/);
  assert.match(journal, /to="\/journal\/map">Mapa/);
  assert.match(journal, /to="\/journal\/calendar">Kalendář/);
});
