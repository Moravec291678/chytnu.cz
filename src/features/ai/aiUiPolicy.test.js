import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AI_FEATURES } from "./aiPolicy.js";

const source = path => readFile(new URL(path, import.meta.url), "utf8");

test("catch detail keeps only the permitted user-reviewed fishing story tool", async () => {
  const [page, assistance] = await Promise.all([
    source("../../pages/CatchDetailPage.jsx"), source("./CatchAiAssistance.jsx"),
  ]);
  assert.match(page, /<CatchAiAssistance/);
  assert.match(assistance, /\[\["improve", "Vylepšit vyprávění"\]/);
  assert.match(assistance, /<h4>Návrh AI k vlastní kontrole<\/h4>/);
  assert.doesNotMatch(assistance, /rozpozn.{0,20}(ryb|fotograf)|identifik.{0,20}ryb|analyz.{0,20}fotograf|speciesProvider/i);
  assert.doesNotMatch(assistance, /<img|type="file"/);
});

test("ordinary settings expose only story and diary-tip consent, with no obsolete forecast section", async () => {
  const [settings, section, stats, flags] = await Promise.all([
    source("./AiSettings.jsx"), source("../../pages/SettingsPage.jsx"), source("../../pages/StatsPage.jsx"),
    source("../../product/config/featureFlags.js"),
  ]);
  assert.deepEqual(Object.keys(AI_FEATURES).filter(key => AI_FEATURES[key]).sort(), ["recommendations", "stories"]);
  assert.match(section, /Příběhy a tipy z deníku/);
  assert.match(settings, /stories: "Pomoc s rybářským vyprávěním"/);
  assert.match(settings, /recommendations: "Tipy pro další vycházku podle souhrnů deníku"/);
  for (const obsolete of ["species", "rozpoznávání", "fotografií", "AI analýza fotografie"]) assert.doesNotMatch(settings, new RegExp(obsolete, "i"));
  assert.doesNotMatch(stats, /Doporučení na 48 hodin|aiInsights|dailyTips/);
  assert.doesNotMatch(flags, /aiInsights|dailyTips/);
});

test("privacy policy no longer claims image or species inference and limits AI to two diary functions", async () => {
  const policy = await source("../../pages/legalDocuments.js");
  assert.match(policy, /Jediné externí AI funkce jsou volitelné návrhy rybářských příběhů/);
  assert.match(policy, /tipy z vypočítaných souhrnů deníku/);
  assert.doesNotMatch(policy, /automatické rozpoznávání nových rychlých úlovků|Pro rozpoznání ryby odešleme|rozpoznávání ryb, vysvětlení deníku/i);
});
