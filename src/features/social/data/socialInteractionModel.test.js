import assert from "node:assert/strict";
import { test } from "node:test";
import { commentText, interactionInput } from "./socialInteractionModel.js";
import { interactionCounts } from "../server/socialInteractionCounters.js";

test("social interaction input validates comment length and supported reports", () => {
  assert.equal(commentText("  Bezpečný komentář  "), "Bezpečný komentář");
  assert.throws(() => commentText("x".repeat(501)), /invalid_interaction/);
  assert.deepEqual(
    interactionInput({ postId: "a".repeat(64), commentId: "11111111-1111-4111-8111-111111111111", reason: "spam", details: "  Opakovaný spam  " }, "report"),
    { postId: "a".repeat(64), commentId: "11111111-1111-4111-8111-111111111111", reason: "spam", details: "  Opakovaný spam  " },
  );
  assert.throws(() => interactionInput({ postId: "a".repeat(64), reason: "unknown" }, "report"), /invalid_interaction/);
});

test("interaction counts default only missing legacy values and reject corrupt counters", () => {
  assert.deepEqual(interactionCounts({}), {
    reactionCounts: { respect: 0, amazing: 0, trophy: 0, atmosphere: 0 },
    commentCount: 0,
  });
  assert.throws(() => interactionCounts({ reactionCounts: { respect: -1 } }), /interaction_conflict/);
  assert.throws(() => interactionCounts({ commentCount: "1" }), /interaction_conflict/);
});
