import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMUNITY_COMMENT_MAX_LENGTH,
  communityInteractionRepository,
} from "./communityInteractionRepository.js";

const scopeA = { scopeKey: "guest:community-a", ownerId: null };
const scopeB = { scopeKey: "guest:community-b", ownerId: null };

test("comments create, list, reload and delete only for their Catch and scope", async () => {
  const first = await communityInteractionRepository.createComment({ catchId: "catch-a", text: " První komentář ", author: "Místní profil", scope: scopeA });
  await communityInteractionRepository.createComment({ catchId: "catch-b", text: "Jiný úlovek", author: "Místní profil", scope: scopeA });
  await communityInteractionRepository.createComment({ catchId: "catch-a", text: "Jiný profil", author: "Jiný profil", scope: scopeB });

  assert.deepEqual((await communityInteractionRepository.listComments("catch-a", scopeA)).map((item) => item.text), ["První komentář"]);
  assert.deepEqual((await communityInteractionRepository.listComments("catch-a", scopeB)).map((item) => item.text), ["Jiný profil"]);
  await assert.rejects(communityInteractionRepository.deleteOwnComment(first.id, scopeB), /vlastní komentář/);
  assert.equal(await communityInteractionRepository.deleteOwnComment(first.id, scopeA), true);
  assert.deepEqual(await communityInteractionRepository.listComments("catch-a", scopeA), []);
});

test("comments reject empty and overlong text", async () => {
  await assert.rejects(communityInteractionRepository.createComment({ catchId: "catch", text: "   ", scope: scopeA }), /prázdný/);
  await assert.rejects(communityInteractionRepository.createComment({ catchId: "catch", text: "x".repeat(COMMUNITY_COMMENT_MAX_LENGTH + 1), scope: scopeA }), /maximálně/);
});

test("reactions add, change, remove and deduplicate per Catch and scope", async () => {
  const first = await communityInteractionRepository.setOwnReaction({ catchId: "reaction-catch", type: "like", scope: scopeA });
  const changed = await communityInteractionRepository.setOwnReaction({ catchId: "reaction-catch", type: "trophy", scope: scopeA });
  assert.equal(first.id, changed.id);
  assert.equal((await communityInteractionRepository.getOwnReaction("reaction-catch", scopeA)).type, "trophy");
  assert.equal(await communityInteractionRepository.getOwnReaction("reaction-catch", scopeB), null);
  assert.equal(await communityInteractionRepository.setOwnReaction({ catchId: "reaction-catch", type: null, scope: scopeA }), null);
  assert.equal(await communityInteractionRepository.getOwnReaction("reaction-catch", scopeA), null);
});

test("report creates and updates a real local pending record with an allowed reason", async () => {
  const report = await communityInteractionRepository.createReport({ catchId: "reported-catch", reason: "spam", scope: scopeA });
  assert.equal(report.status, "local-pending");
  assert.equal((await communityInteractionRepository.getOwnReport("reported-catch", scopeA)).reason, "spam");
  const updated = await communityInteractionRepository.createReport({ catchId: "reported-catch", reason: "suspicious-catch", scope: scopeA });
  assert.equal(updated.id, report.id);
  assert.equal(updated.reason, "suspicious-catch");
  await assert.rejects(communityInteractionRepository.createReport({ catchId: "reported-catch", reason: "other", scope: scopeA }), /platný důvod/);
});
