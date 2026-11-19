import assert from "node:assert/strict";
import { test } from "node:test";
import { createSocialEntryService, socialEntryId } from "./socialEntryService.js";
import { publicAchievementChoices } from "../data/publicProgressionModel.js";
import { publicProgressionFromSummary } from "./publicProgressionService.js";
const uid = "entry-owner", entryId = "12345678-1234-4234-8234-123456789abc";
const basic = { entryId, kind: "experience", visibility: "public", expectedRevision: 0, title: "U vody", description: "Skutečný zážitek" };
const choice = publicAchievementChoices()[0];
function fixture(overrides = {}) {
  const rows = new Map(Object.entries({ [`publicProfiles/${uid}`]: { uid, sharedAchievementIds: [choice.id] },
    [`users/${uid}/socialPreferences/publication`]: {version:1,mode:"public",epoch:1,acceptedAt:1},
    [`users/${uid}/serverProgressionState/summary`]: { ownerId: uid, serverEventXp: 120 }, ...overrides }));
  const writes = [], reads = [];
  const tx = { get: async path => { reads.push(path); return { exists: rows.has(path), data: () => rows.get(path) }; },
    set: (path, value) => { writes.push(path); rows.set(path, value); } };
  const db = { doc: path => path, runTransaction: work => work(tx) };
  return { service: createSocialEntryService({ db, now: () => 1234567890 }), rows, writes, reads, tx };
}
test("stable entries use separate IDs, mandatory CAS, revisions and safe experience content", async () => {
  const f = fixture(), saved = await f.service.save(uid, basic);
  assert.equal(saved.row.id, socialEntryId(uid, entryId)); assert.equal(saved.row.revision, 1);
  assert.deepEqual(saved.row.content, { title: "U vody", description: basic.description });
  assert.deepEqual(f.writes, [`socialPosts/${saved.row.id}`]);
  await assert.rejects(f.service.save(uid, basic), /post_conflict/);
  const edited = await f.service.save(uid, { ...basic, expectedRevision: 1, description: "Upraveno" });
  assert.equal(edited.row.revision, 2); assert.equal(edited.row.createdAt, saved.row.createdAt);
  await assert.rejects(f.service.save(uid, { ...basic, expectedRevision: 2, kind: "milestone" }), /post_conflict/);
});
test("achievement uses only selected nonhidden catalogue DTO and withdrawal revokes", async () => {
  const f = fixture(), { row, profile } = await f.service.save(uid, { ...basic, kind: "achievement", achievementId: choice.id, title: "CLIENT TITLE" });
  assert.deepEqual(row.content.achievement, choice); assert.equal(row.content.title, choice.title);
  assert.equal(choice.source, "unverified"); assert.equal(choice.rewardGranted, false);
  assert.equal(await f.service.approved({ tx: f.tx, profile, row }), true);
  const reversed = Object.fromEntries(Object.entries(row.content.achievement).reverse());
  assert.equal(await f.service.approved({ tx: f.tx, profile, row: { ...row, content: { ...row.content, achievement: reversed } } }), true);
  for (const achievement of [{ ...reversed, verified: true }, { ...reversed, extra: "forged" }]) {
    assert.equal(await f.service.approved({ tx: f.tx, profile, row: { ...row, content: { ...row.content, achievement } } }), false);
  }
  assert.equal(await f.service.approved({ tx: f.tx, profile: { ...profile, sharedAchievementIds: [] }, row }), false);
  await assert.rejects(fixture().service.save(uid, { ...basic, kind: "achievement", achievementId: "hidden-or-unknown" }), /post_unavailable/);
});
test("milestone snapshots confirmed server XP, growth remains approved and correction revokes", async () => {
  const f = fixture(), { row, profile } = await f.service.save(uid, { ...basic, kind: "milestone" });
  assert.deepEqual(row.content.progression, publicProgressionFromSummary({ ownerId: uid, serverEventXp: 120 }, uid));
  assert.equal(await f.service.approved({ tx: f.tx, profile, row }), true);
  const reversed = Object.fromEntries(Object.entries(row.content.progression).reverse());
  assert.equal(await f.service.approved({ tx: f.tx, profile, row: { ...row, content: { ...row.content, progression: reversed } } }), true);
  assert.equal(await f.service.approved({ tx: f.tx, profile, row: { ...row, content: { ...row.content, progression: { ...reversed, extra: "forged" } } } }), false);
  f.rows.set(`users/${uid}/serverProgressionState/summary`, { ownerId: uid, serverEventXp: 200 });
  assert.equal(await f.service.approved({ tx: f.tx, profile, row }), true);
  f.rows.set(`users/${uid}/serverProgressionState/summary`, { ownerId: uid, serverEventXp: 119 });
  assert.equal(await f.service.approved({ tx: f.tx, profile, row }), false);
  assert.equal(await f.service.approved({ tx: f.tx, profile, row: { ...row, content: { ...row.content, progression: { ...row.content.progression, rank: "Forged" } } } }), false);
  assert.deepEqual(f.writes, [`socialPosts/${row.id}`]);
});
test("local-only, missing, zero or foreign-owned XP cannot publish milestone", async () => {
  for (const summary of [undefined, { ownerId: uid, xp: 99999 }, { ownerId: uid, serverEventXp: 0 }, { ownerId: "other", serverEventXp: 100 }, { ownerId: uid, serverEventXp: -1 }]) {
    const f = fixture({ [`users/${uid}/serverProgressionState/summary`]: summary });
    await assert.rejects(f.service.save(uid, { ...basic, kind: "milestone" }), /post_unavailable/); assert.equal(f.writes.length, 0);
  }
});
test("entry input rejects arbitrary fields, media, locations, invalid ids and revisions", async () => {
  for (const extra of [{ gps: { lat: 1 } }, { url: "https://example.test" }, { photoId: "photo" }, { content: {} }, { expectedRevision: undefined }, { expectedRevision: -1 },
    { entryId: "unstable" }, { kind: "catch" }, { description: "x".repeat(1001) }, { title: "x".repeat(101) }, { description: "" }, { description: "\u0000" }, { achievementId: choice.id }]) {
    await assert.rejects(fixture().service.save(uid, { ...basic, ...extra }), /invalid_publication/);
  }
});
test("deleted/suspended accounts and disabled posts cannot publish; tombstone CAS preserves moderation", async () => {
  for (const [path, data, error] of [[`accountDeletions/${uid}`, {}, "account_unavailable"], [`accountSuspensions/${uid}`, {}, "account_unavailable"], ["adminConfig/social", { postsEnabled: false }, "social_disabled"], [`publicProfiles/${uid}`, undefined, "save_profile_first"]]) {
    await assert.rejects(fixture({ [path]: data }).service.save(uid, basic), new RegExp(error));
  }
  const f = fixture(), { row } = await f.service.save(uid, basic);
  f.rows.set(`socialPosts/${row.id}`, { ...row, deleted: true, revision: 2, moderationState: "hidden" });
  await assert.rejects(f.service.save(uid, { ...basic, expectedRevision: 1 }), /post_conflict/);
  const restored = await f.service.save(uid, { ...basic, expectedRevision: 2 });
  assert.equal(restored.row.moderationState, "hidden"); assert.equal(restored.row.revision, 3);
  assert.equal(await f.service.approved({ tx: f.tx, profile: restored.profile, row: restored.row }), false);
});

test("parent guard callback is reused before any publication writes", async () => {
  let guarded;
  const service = createSocialEntryService({ db: { doc: path => path, runTransaction: work => work("transaction") }, guard: async (tx, owner) => {
    guarded = [tx, owner]; throw new Error("social_disabled");
  } });
  await assert.rejects(service.save(uid, basic), /social_disabled/);
  assert.deepEqual(guarded, ["transaction", uid]);
});
