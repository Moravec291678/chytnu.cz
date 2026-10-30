import assert from "node:assert/strict";
import test from "node:test";
import { completedSyncState, logicalSyncKey, SYNC_LIFECYCLE_STATE } from "./syncLifecycleState.js";

const summary = { pending: 0, failed: 0, pullPending: 0, conflicts: 0 };

test("transient failures wait for automatic retry while permanent auth and conflicts require action", () => {
  assert.equal(completedSyncState({ result: { status: "error" }, summary, retryable: true }), SYNC_LIFECYCLE_STATE.RETRY_WAIT);
  assert.equal(completedSyncState({ result: { status: "error" }, summary, retryable: false }), SYNC_LIFECYCLE_STATE.USER_ACTION_REQUIRED);
  assert.equal(completedSyncState({ result: { status: "success" }, summary: { ...summary, conflicts: 1 } }), SYNC_LIFECYCLE_STATE.USER_ACTION_REQUIRED);
  assert.equal(completedSyncState({ result: { status: "success" }, summary: { ...summary, pullPending: 1, pullRetryable: true } }), SYNC_LIFECYCLE_STATE.RETRY_WAIT);
  assert.equal(completedSyncState({ result: { status: "success" }, photoResult: { needsAttention: true }, summary }), SYNC_LIFECYCLE_STATE.USER_ACTION_REQUIRED);
});

test("later success clears retry state and one Catch plus photos is one logical operation", () => {
  assert.equal(completedSyncState({ result: { status: "error" }, summary: { ...summary, pending: 1, failed: 1 } }), SYNC_LIFECYCLE_STATE.RETRY_WAIT);
  assert.equal(completedSyncState({ result: { status: "success" }, summary }), SYNC_LIFECYCLE_STATE.SYNCED);
  assert.equal(completedSyncState({ result: { status: "success" }, summary: { ...summary, pending: 1 } }), SYNC_LIFECYCLE_STATE.LOCAL_PENDING);
  assert.equal(logicalSyncKey({ entityType: "photoCloud", photoCloud: { catchId: "a" } }), logicalSyncKey({ entityType: "catch", entityId: "a" }));
});


test("stale auth error without an outstanding failed operation does not block success", () => {
  assert.equal(completedSyncState({ result: { status: "success" }, summary: { ...summary,
    lastErrorCode: "firebase_token_invalid" } }), "synced");
});
