import assert from "node:assert/strict";
import test from "node:test";
import { getSyncPendingCount, getSyncStatusView, runManualSync, runSyncRetry, SYNC_STATUS_COMPACT_DELAY_MS } from "./syncStatusView.js";
import SyncStatus from "./SyncStatus.js";

test("short, offline, retrying and completed sync never show a global banner", () => {
  assert.equal(SYNC_STATUS_COMPACT_DELAY_MS, 2_500);
  for (const status of ["idle", "local-pending", "retry-wait", "synced", "user-action-required"]) {
    assert.equal(getSyncStatusView({ status, showSyncStatus: true }, true, true).kind, "hidden");
  }
  assert.equal(getSyncStatusView({ status: "syncing", showSyncStatus: true }, true, false).kind, "hidden");
  assert.equal(getSyncStatusView({ status: "syncing", showSyncStatus: true }, false, true).kind, "hidden");
});

test("long active sync has only a small delayed accessible indicator with real logical pending count and hide action", () => {
  assert.equal(getSyncPendingCount({ pending: 1, pullPending: 0 }), 1);
  assert.deepEqual(getSyncStatusView({ status: "syncing", showSyncStatus: true, pending: 10 }, true, true), { kind: "syncing" });
  let hidden = false;
  const view = SyncStatus({ sync: { hideStatus: () => { hidden = true; }, status: "syncing", showSyncStatus: true, pending: 10 }, isOnline: true, compact: true });
  assert.equal(view.props.role, "status");
  assert.equal(view.props["aria-label"], "Synchronizace probíhá");
  assert.match(view.props.className, /minimal/);
  assert.equal(JSON.stringify(view).includes("Zbývá 10"), true);
  view.props.children[2].props.onClick();
  assert.equal(hidden, true);
  assert.equal(SyncStatus({ sync: { status: "retry-wait", error: "timeout" }, isOnline: true, compact: true }), null);
});

test("manual sync remains available in detail", () => {
  let manualRuns = 0;
  let retries = 0;
  assert.equal(runManualSync({ syncNow: () => ++manualRuns }), 1);
  assert.equal(runSyncRetry({ retry: () => ++retries }), 1);
});
