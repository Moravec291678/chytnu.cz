import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { catchRepository, getActiveGuestScopeKey } from "../../catches/data/catchRepository.js";
import { tripRepository } from "../../trips/data/tripRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { buildCatchRewardFromLedger, buildLedgerProgressionSummary, claimCatchRewardEventIds, getCatchRewardEventIds, progressionLedger, summaryForXp } from "./progressionLedger.js";
import { xpForLevel } from "./progression.js";

async function reset() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("chytnu-local");
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  return { scopeKey: await getActiveGuestScopeKey(), ownerId: null };
}

function record(id, overrides = {}) {
  const stamp = "2026-10-19T10:00:00.000Z";
  return { id, schemaVersion: 1, createdAt: stamp, updatedAt: stamp, caughtAt: stamp, species: "Kapr", speciesKey: "carp", tripId: null, photos: [], sync: { status: "local", revision: 1 }, ...overrides };
}

test("catch progression events are persistent and idempotent across retries and edits", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("catch-1"), scope);
  await progressionLedger.reconcileCatch(stored, scope);
  await progressionLedger.reconcileCatch(stored, scope);
  let events = await progressionLedger.list(scope);
  const initialXp = events.reduce((sum, event) => sum + event.xp, 0);
  assert.equal(events.filter((event) => event.type === "catch.created").length, 1);
  assert.equal(events.filter((event) => event.type === "species.first").length, 1);
  assert.equal(events.filter((event) => event.type === "achievement.unlocked" && event.reasonKey.endsWith("first-catch")).length, 1);
  const edited = await catchRepository.put({ ...stored, photos: [{ id: "p", blob: new Blob(["x"]) }], sync: { ...stored.sync, revision: 2 } }, scope);
  await progressionLedger.reconcileCatch(edited, scope);
  await progressionLedger.reconcileCatch(edited, scope);
  events = await progressionLedger.list(scope);
  assert.equal(events.filter((event) => event.type === "catch.photo").length, 1);
  assert.equal(events.reduce((sum, event) => sum + event.xp, 0), initialXp + 5);
});

test("reload, direct reward lookup, edit, and deletion never grant the same reward twice", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("durable", {
    coordinates: { latitude: 50, longitude: 14 }, conditions: { airTempC: 12 },
  }), scope);
  await progressionLedger.reconcile(scope);
  const first = await progressionLedger.list(scope);
  const firstSummary = buildLedgerProgressionSummary(first, [stored], []);
  const firstReward = buildCatchRewardFromLedger(first, stored.id, firstSummary);

  await catchRepository.put({ ...stored, notes: "edit", sync: { ...stored.sync, revision: 2 } }, scope);
  await progressionLedger.reconcile(scope);
  await progressionLedger.reconcile(scope);
  const afterReload = await progressionLedger.list(scope);
  const secondReward = buildCatchRewardFromLedger(afterReload, stored.id, buildLedgerProgressionSummary(afterReload, [stored], []));
  assert.equal(afterReload.reduce((sum, event) => sum + event.xp, 0), firstSummary.xp);
  assert.equal(secondReward.xp, firstReward.xp);
  assert.equal(afterReload.filter((event) => event.type === "catch.created").length, 1);
  assert.equal(afterReload.filter((event) => event.type === "catch.context").length, 1);

  await catchRepository.delete(stored.id, scope);
  const afterDelete = await progressionLedger.list(scope);
  const deletedSummary = buildLedgerProgressionSummary(afterDelete, [], []);
  assert.equal(deletedSummary.xp, firstSummary.xp);
  assert.equal(deletedSummary.achievements.find((item) => item.id === "first-catch").isCompleted, true);
  assert.equal(deletedSummary.mastery.find((item) => item.speciesKey === "carp").level, 1);
});

test("weight achievements stay unlocked after the qualifying Catch is edited below the threshold or deleted", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("weight-record", { weightKg: 10, weightSource: "manual" }), scope);
  await progressionLedger.reconcile(scope);

  const edited = await catchRepository.put({
    ...stored,
    weightKg: 0.5,
    sync: { ...stored.sync, revision: 2 },
  }, scope);
  await progressionLedger.reconcile(scope);
  let events = await progressionLedger.list(scope);
  let summary = buildLedgerProgressionSummary(events, [edited], []);
  assert.equal(summary.achievements.find((item) => item.id === "first-kilo").isCompleted, true);
  assert.equal(summary.achievements.find((item) => item.id === "trophy-catch").isCompleted, true);

  await catchRepository.delete(edited.id, scope);
  events = await progressionLedger.list(scope);
  summary = buildLedgerProgressionSummary(events, [], []);
  assert.equal(summary.achievements.find((item) => item.id === "first-kilo").isCompleted, true);
  assert.equal(summary.achievements.find((item) => item.id === "trophy-catch").isCompleted, true);
  assert.equal(events.filter((event) => event.reasonKey === "achievement.unlocked:trophy-catch").length, 1);
});

test("GPS with a moon phase alone does not earn the GPS and weather catch tier", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("moon-only", {
    coordinates: { latitude: 50, longitude: 14 }, conditions: { moonPhase: "full" },
  }), scope);

  await progressionLedger.reconcile(scope);
  const events = await progressionLedger.list(scope);

  assert.equal(events.some((event) => event.reasonKey === "catch.context:moon-only"), false);
  assert.equal(buildLedgerProgressionSummary(events, [stored], []).xpBreakdown.catchXp, 10);
});

test("free-text catch locations never award new-water XP; mastery, achievements and streak IDs stay one-time", async () => {
  const scope = await reset();
  const dates = [
    "2026-09-28T10:00:00.000Z", "2026-10-05T10:00:00.000Z",
    "2026-10-12T10:00:00.000Z", "2026-10-19T10:00:00.000Z",
  ];
  for (let index = 0; index < dates.length; index += 1) {
    await catchRepository.put(record(`streak-${index}`, {
      caughtAt: dates[index], speciesKey: index < 2 ? "carp" : `species-${index}`,
      species: index < 2 ? "Kapr" : `Druh ${index}`, locationName: "Labe",
    }), scope);
  }
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-19T12:00:00.000Z") });
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-19T12:00:00.000Z") });
  const events = await progressionLedger.list(scope);
  assert.equal(events.filter((event) => event.type === "water.created").length, 0);
  assert.equal(events.some((event) => event.reasonKey === "water.first:labe"), false);
  assert.equal(events.filter((event) => event.reasonKey === "mastery.milestone:carp:1").length, 1);
  assert.equal(events.filter((event) => event.reasonKey === "achievement.unlocked:first-catch").length, 1);
  assert.equal(events.filter((event) => event.reasonKey === "streak.milestone:4").length, 1);
  assert.equal(new Set(events.filter((event) => event.type === "challenge.completed").map((event) => event.id)).size,
    events.filter((event) => event.type === "challenge.completed").length);
});

test("species mastery rewards and unlocked milestones survive deletion of their qualifying catches", async () => {
  const scope = await reset();
  const records = [];
  for (let index = 0; index < 20; index += 1) {
    records.push(await catchRepository.put(record(`mastery-catch-${index}`, {
      speciesKey: "stable-species-id", species: "Testovací druh",
    }), scope));
  }
  await progressionLedger.reconcile(scope);
  const beforeEvents = await progressionLedger.list(scope);
  const beforeSummary = buildLedgerProgressionSummary(beforeEvents, records, []);
  const beforeMastery = beforeSummary.mastery.find((item) => item.speciesKey === "stable-species-id");
  assert.equal(beforeMastery.level, 3);
  assert.equal(beforeMastery.progressCount, 20);
  assert.equal(beforeMastery.xp, 130);

  for (const recordToDelete of records) await catchRepository.delete(recordToDelete.id, scope);
  await progressionLedger.reconcile(scope);
  const afterEvents = await progressionLedger.list(scope);
  const afterSummary = buildLedgerProgressionSummary(afterEvents, [], []);
  const afterMastery = afterSummary.mastery.find((item) => item.speciesKey === "stable-species-id");
  assert.equal(afterSummary.xp, beforeSummary.xp);
  assert.equal(afterMastery.level, 3);
  assert.equal(afterMastery.progressCount, 20);
  assert.equal(afterMastery.catchCount, 0);
  assert.equal(afterMastery.nextLevelAt, 50);
  assert.equal(afterMastery.xp, 130);
  assert.equal(afterEvents.filter((event) => event.reasonKey === "mastery.milestone:stable-species-id:3").length, 1);
});

test("new-water XP uses its stable Water ID and is not duplicated by retry or rename", async () => {
  const scope = await reset();
  const water = { id: "water-stable-id", name: "Labe 24", createdAt: "2026-10-19T10:00:00.000Z" };
  await waterRepository.put(water, scope);
  const first = await progressionLedger.awardWater(water, scope);
  const retry = await progressionLedger.awardWater({ ...water, name: "Labe 25" }, scope);
  const events = await progressionLedger.list(scope);
  assert.equal(first.isNew, true);
  assert.equal(retry.isNew, false);
  assert.equal(events.filter((event) => event.reasonKey === "water.created:water-stable-id").length, 1);
  assert.equal(events.find((event) => event.reasonKey === "water.created:water-stable-id").xp, 30);
});

test("legendary rarity and completed public share award persistent XP once", async () => {
  const scope = await reset();
  const legendary = await catchRepository.put(record("legendary-catch", {
    speciesKey: "commonCarp", weightKg: 20, weightSource: "manual",
  }), scope);
  await progressionLedger.reconcile(scope);
  await progressionLedger.reconcile(scope);
  let events = await progressionLedger.list(scope);
  assert.equal(events.filter((event) => event.reasonKey === "rarity.legendary:legendary-catch").length, 1);
  assert.equal(events.find((event) => event.reasonKey === "rarity.legendary:legendary-catch").xp, 200);

  const firstShare = await progressionLedger.awardPublicShare(legendary.id, scope);
  const retryShare = await progressionLedger.awardPublicShare(legendary.id, scope);
  events = await progressionLedger.list(scope);
  assert.equal(firstShare.isNew, true);
  assert.equal(retryShare.isNew, false);
  assert.equal(events.filter((event) => event.reasonKey === "share.public:legendary-catch").length, 1);
  assert.equal(events.find((event) => event.reasonKey === "share.public:legendary-catch").xp, 10);
  assert.equal(buildLedgerProgressionSummary(events, [legendary], []).xpBreakdown.publicShareXp, 10);
});

test("streak freeze is scoped, persisted, and can be applied only once per Prague month", async () => {
  const scope = await reset();
  const now = new Date("2026-06-17T10:00:00.000Z");
  await assert.rejects(progressionLedger.useStreakFreeze(scope, { now }), /Zmrazení lze použít/);
  await catchRepository.put(record("freeze-week-one", { caughtAt: "2026-06-04T10:00:00.000Z" }), scope);
  await catchRepository.put(record("freeze-week-two", { caughtAt: "2026-06-11T10:00:00.000Z" }), scope);
  const first = await progressionLedger.useStreakFreeze(scope, { now });
  const retry = await progressionLedger.useStreakFreeze(scope, { now });
  assert.equal(first.isNew, true);
  assert.equal(retry.isNew, false);
  assert.equal(first.event.periodKey, "2026-06-15");
  assert.equal((await progressionLedger.list(scope)).filter((event) => event.type === "streak.freeze.used").length, 1);
  await progressionLedger.reconcile(scope, { now });
  const events = await progressionLedger.list(scope);
  const catches = await catchRepository.list(scope);
  assert.equal(progressionLedger.summary(events, catches, [], { now }).streak.weeks, 3);
});

test("the +50 XP streak bonus is recorded once when the seventh qualifying week is reached", async () => {
  const scope = await reset();
  const dates = ["2026-05-06", "2026-05-13", "2026-05-20", "2026-05-27", "2026-06-03", "2026-06-10", "2026-06-17"];
  for (const [index, date] of dates.entries()) {
    await catchRepository.put(record(`bonus-week-${index}`, { caughtAt: `${date}T10:00:00.000Z` }), scope);
  }
  const now = new Date("2026-06-17T12:00:00.000Z");
  await progressionLedger.reconcile(scope, { now });
  await progressionLedger.reconcile(scope, { now });
  const bonusEvents = (await progressionLedger.list(scope)).filter((event) => event.reasonKey === "streak.bonus:7");
  assert.equal(bonusEvents.length, 1);
  assert.equal(bonusEvents[0].xp, 50);
});

test("every screen selector receives the same ledger XP, level, rank, and progress", () => {
  const events = [
    { type: "catch.created", reasonKey: "catch.created:a", xp: 10 },
    { type: "species.first", reasonKey: "species.first:carp", xp: 50 },
    { type: "achievement.unlocked", reasonKey: "achievement.unlocked:first-catch", xp: 30 },
  ];
  const summaries = Array.from({ length: 4 }, () => buildLedgerProgressionSummary(events, [], []));
  for (const summary of summaries.slice(1)) {
    assert.deepEqual(
      { xp: summary.xp, level: summary.level, rank: summary.rank, progressPercent: summary.progressPercent },
      { xp: summaries[0].xp, level: summaries[0].level, rank: summaries[0].rank, progressPercent: summaries[0].progressPercent },
    );
  }
});

test("ledger level and rank transitions match every requested boundary", () => {
  for (const [lastLevel, nextLevel, rankBefore, rankAfter] of [
    [5, 6, "Nováček", "Rybář"],
    [15, 16, "Rybář", "Zkušený rybář"],
    [29, 30, "Zkušený rybář", "Senior rybář"],
    [49, 50, "Senior rybář", "Expert"],
    [74, 75, "Expert", "Legenda"],
    [99, 100, "Legenda", "Prestige I+"],
  ]) {
    const beforeTransition = summaryForXp(xpForLevel(nextLevel) - 1);
    const afterTransition = summaryForXp(xpForLevel(nextLevel));
    assert.equal(beforeTransition.level, lastLevel);
    assert.equal(beforeTransition.rank.name, rankBefore);
    assert.equal(afterTransition.level, nextLevel);
    assert.equal(afterTransition.rank.name, rankAfter);
  }
});

test("catch reward event IDs can be presented only once in a browser session", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.deepEqual(claimCatchRewardEventIds("catch-a", ["event-a", "event-b"], storage), ["event-a", "event-b"]);
  assert.deepEqual(claimCatchRewardEventIds("catch-a", ["event-a", "event-b"], storage), []);
  assert.deepEqual(claimCatchRewardEventIds("catch-a", ["event-c"], storage), ["event-c"]);
  assert.deepEqual(claimCatchRewardEventIds("catch-direct", undefined, storage), []);
});

test("catch reward event IDs are recovered from the ledger when another reconciliation created them", () => {
  const events = [
    { id: "create-1", sourceEntityType: "catch", sourceEntityId: "catch-a" },
    { id: "species-1", sourceEntityType: "catch", sourceEntityId: "catch-a" },
    { id: "create-2", sourceEntityType: "catch", sourceEntityId: "catch-b" },
  ];
  assert.deepEqual(getCatchRewardEventIds(events, "catch-a"), ["create-1", "species-1"]);
});

test("a saved catch carries its ledger event IDs into the reward calculation", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("reward-catch"), scope);
  const reconciled = await progressionLedger.reconcile(scope);
  const eventIds = getCatchRewardEventIds(reconciled.events, stored.id);
  const summary = buildLedgerProgressionSummary(reconciled.events, [stored], []);
  const reward = buildCatchRewardFromLedger(reconciled.events, stored.id, summary, eventIds);

  assert.ok(eventIds.length > 0);
  assert.equal(reward.breakdown.catchXp, 10);
  assert.equal(reward.breakdown.speciesXp, 50);
});

test("a marathon achievement is attributed to its qualifying Trip instead of an unrelated Catch", async () => {
  const scope = await reset();
  await catchRepository.put(record("unrelated-catch"), scope);
  const trip = await tripRepository.start({
    id: "marathon-trip-source",
    title: "Noční výprava",
    startedAt: "2026-10-18T18:00:00.000Z",
  }, scope);
  await tripRepository.put({ ...trip, endedAt: "2026-10-19T03:00:00.000Z" }, scope);

  await progressionLedger.reconcile(scope);
  const event = (await progressionLedger.list(scope))
    .find((item) => item.reasonKey === "achievement.unlocked:marathon-trip");

  assert.equal(event.sourceEntityType, "trip");
  assert.equal(event.sourceEntityId, "marathon-trip-source");
  assert.equal(event.occurredAt, "2026-10-19T03:00:00.000Z");
});
