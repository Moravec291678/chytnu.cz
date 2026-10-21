import assert from "node:assert/strict";
import test from "node:test";
import { getSyncStatusView } from "./syncStatusView.js";
import { runManualSync, runSyncRetry } from "./syncStatusView.js";
import SyncStatus from "./SyncStatus.js";

test("sync overlay stays absent for idle and no-op periodic sync states", () => {
  assert.equal(getSyncStatusView({ status: "idle" }).kind, "hidden");
  assert.equal(getSyncStatusView({ status: "syncing", showSyncStatus: false }).kind, "hidden");
  assert.equal(getSyncStatusView({ status: "success", showSyncStatus: false }).kind, "hidden");
});

test("meaningful progress and success have a polite status; errors remain visible through retry", () => {
  assert.equal(getSyncStatusView({ status: "syncing", showSyncStatus: true }).kind, "syncing");
  assert.equal(getSyncStatusView({ status: "success", showSyncStatus: true }).kind, "success");
  assert.equal(getSyncStatusView({ status: "error", showSyncStatus: false }).kind, "error");
  assert.equal(getSyncStatusView({ status: "syncing", error: "retry in progress", showSyncStatus: true }).kind, "error");
  assert.equal(getSyncStatusView({ status: "offline" }, false).kind, "offline");
});

test("SyncStatus component renders accessible progress/success and wires Retry", () => {
  assert.equal(SyncStatus({ sync: { status: "idle" }, isOnline: true }), null);
  const progress = SyncStatus({ sync: { status: "syncing", showSyncStatus: true }, isOnline: true });
  const progressCard = progress.props.children;
  assert.equal(progressCard.props.role, "status");
  assert.equal(progressCard.props["aria-live"], "polite");
  const success = SyncStatus({ sync: { status: "success", showSyncStatus: true }, isOnline: true });
  assert.equal(success.props.children.props.role, "status");

  let retries = 0;
  const error = SyncStatus({ sync: { status: "error", error: "Dočasná chyba", retry: () => { retries += 1; } }, isOnline: true });
  const errorCard = error.props.children;
  assert.equal(errorCard.props.role, "alert");
  assert.equal(errorCard.props["aria-live"], "assertive");
  errorCard.props.children[1].props.onClick();
  assert.equal(retries, 1);
});

test("manual sync and retry controls keep their handlers callable", () => {
  let manualRuns = 0;
  let retries = 0;
  assert.equal(runManualSync({ syncNow: () => ++manualRuns }), 1);
  assert.equal(runSyncRetry({ retry: () => ++retries }), 1);
  assert.equal(manualRuns, 1);
  assert.equal(retries, 1);
});
