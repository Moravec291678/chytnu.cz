import test from "node:test";
import assert from "node:assert/strict";
import { ACHIEVEMENT_DEFINITIONS } from "../../../product/config/achievements.js";
import { summaryForXp } from "../../progression/data/progressionSummary.js";
import { publicAchievementChoices, selectedPublicAchievements, validSharedAchievementIds } from "../data/publicProgressionModel.js";
import { projectPublicProgression, publicProgressionFromSummary } from "./publicProgressionService.js";

const uid = "fixture_a", profile = { uid, sections: { achievements: "public" }, sharedAchievementIds: ["first-catch"] };
function context({ currentProfile = profile, audience = "stranger", summaryOnly = false, summary = { ownerId: uid, serverEventXp: 250, legacyBaselineXp: 99999 } } = {}) {
  const reads = [], tx = { async get(ref) { reads.push(ref.path); return { data: () => summary }; }, set() { assert.fail("Projection must not write"); }, update() { assert.fail("Projection must not write"); } };
  return { reads, args: { tx, db: { doc: path => ({ path }) }, profile: currentProfile, audience, summaryOnly } };
}

test("public progression uses existing level engine and excludes unverified legacy baseline", () => {
  for (const xp of [0, 49, 50, 200, 5000, 490050, Number.MAX_SAFE_INTEGER]) {
    const result = publicProgressionFromSummary({ ownerId: uid, serverEventXp: xp, legacyBaselineXp: 99999999, level: 100, rank: "Forged", xp: 99999999 }, uid);
    const expected = summaryForXp(xp);
    assert.equal(result.xp, xp); assert.equal(result.level, expected.level); assert.equal(result.rank, expected.rank.name);
    assert.equal(result.source, "server"); assert.equal(result.scope, "server-events-only"); assert.equal(result.version, 1);
    assert.doesNotMatch(JSON.stringify(result), /legacy|Forged|ownerId/);
  }
});

test("malformed or wrong-owner summaries never become verified XP", () => {
  for (const summary of [null, {}, { ownerId: "other", serverEventXp: 300 }, { serverEventXp: 300 },
    ...[-1, 1.1, "300", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(serverEventXp => ({ ownerId: uid, serverEventXp }))]) {
    assert.equal(publicProgressionFromSummary(summary, uid), null);
  }
});

test("private and friends-only achievements require the permitted audience before any read", async () => {
  for (const [visibility, audience, allowed] of [["private", "stranger", false], ["private", "friend", false],
    ["friends", "stranger", false], ["friends", "friend", true], ["private", "owner", true], ["public", "stranger", true]]) {
    const { reads, args } = context({ currentProfile: { ...profile, sections: { achievements: visibility } }, audience });
    const result = await projectPublicProgression(args);
    assert.equal(reads.length, Number(allowed));
    assert.equal(!!result.progression, allowed);
    if (!allowed) assert.deepEqual(result, {});
  }
});

test("read-only public projection reads one owner summary and never private catch, GPS or reward history", async () => {
  const { reads, args } = context();
  const result = await projectPublicProgression(args);
  assert.deepEqual(reads, [`users/${uid}/serverProgressionState/summary`]);
  assert.equal(result.progression.xp, 250); assert.equal(result.achievements.length, 1);
  assert.equal(result.achievements[0].source, "unverified"); assert.equal(result.achievements[0].unlockedAt, null);
  assert.equal(result.achievements[0].rewardGranted, false);
});

test("directory summary omits selected achievement claims and missing authority does not fabricate a level", async () => {
  const summaryContext = context({ summaryOnly: true });
  const result = await projectPublicProgression(summaryContext.args);
  assert.equal(result.progression.xp, 250); assert.equal(result.achievements, undefined);
  assert.equal((await projectPublicProgression(context({ summary: null }).args)).progression, undefined);
});

test("achievement selection is bounded, explicitly owner reported and restricted to non-hidden product definitions", () => {
  assert.equal(validSharedAchievementIds([]), true); assert.equal(validSharedAchievementIds(["first-catch", "ten-catches"]), true);
  for (const ids of [null, "first-catch", ["first-catch", "first-catch"], ["unknown"], ["night-catch"], ["marathon-trip"],
    publicAchievementChoices().slice(0, 13).map(item => item.id), [{ id: "first-catch", xp: 999999 }]]) assert.equal(validSharedAchievementIds(ids), false);
  const choices = publicAchievementChoices();
  assert.equal(choices.length, ACHIEVEMENT_DEFINITIONS.filter(item => !item.hidden).length);
  for (const choice of choices) {
    const definition = ACHIEVEMENT_DEFINITIONS.find(item => item.id === choice.id);
    assert.equal(choice.title, definition.name); assert.equal(choice.description, definition.description); assert.equal(choice.xp, definition.xp);
    assert.equal(choice.source, "unverified"); assert.equal(choice.verified, false); assert.equal(choice.unlockedAt, null); assert.equal(choice.rewardGranted, false);
  }
  assert.deepEqual(selectedPublicAchievements(["night-catch", "unknown", "first-catch", "first-catch"]), [choices.find(item => item.id === "first-catch")]);
});

test("caller mutation cannot change catalogue labels or subsequent projections", () => {
  const choices = publicAchievementChoices(); choices[0].xp = 999999; choices[0].title = "Forged";
  const fresh = publicAchievementChoices()[0]; assert.notEqual(fresh.xp, 999999); assert.notEqual(fresh.title, "Forged");
});
