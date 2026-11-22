import assert from "node:assert/strict";
import test from "node:test";
import { getSyncPendingCount, getSyncStatusView, runManualSync } from "./syncStatusView.js";

test("compact indicator represents all account states and stays hidden for guests", () => {
  assert.equal(getSyncStatusView({ status: "idle" }).kind, "hidden");
  for (const status of ["synced", "syncing", "local-pending", "retry-wait", "user-action-required", "paused"]) {
    assert.equal(getSyncStatusView({ syncEnabled: true, status }).kind, status);
  }
  assert.equal(getSyncStatusView({ syncEnabled: true, status: "local-pending" }, false).label, "Čeká na internet");
  assert.equal(getSyncPendingCount({ pending: 4, pullPending: 1, photoPending: 3 }), 5);
});

test("third failure removes manual retry; meaningful actions remain visible offline", () => {
  const state = { syncEnabled: true, status: "retry-wait", manualAttempts: 3 };
  assert.equal(getSyncStatusView(state).exhausted, true);
  assert.equal(getSyncStatusView(state).canRetry, false);
  assert.equal(getSyncStatusView({ ...state, manualAttempts: 2 }).canRetry, true);
  assert.equal(getSyncStatusView({ ...state, manualAttempts: 2, retryAfterAt: 10 }).canRetry, false);
  const auth = getSyncStatusView({ ...state, status: "user-action-required", errorCode: "firebase_token_expired" }, false);
  assert.equal(auth.exhausted, false);
  assert.match(auth.action.label, /Obnovit přihlášení/);
  assert.equal(getSyncStatusView({ ...state, conflicts: 1 }, false).kind, "conflict");
  assert.equal(runManualSync({ syncNow: () => 1 }), 1);
});
