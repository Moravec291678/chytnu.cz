import assert from "node:assert/strict";
import test from "node:test";
import { getPullRetryAt, mergeSyncForce, SYNC_PULL_RETRY_DELAY_MS } from "./syncRetry.js";

test("force retry remains queued while sync is already running", () => {
  assert.equal(mergeSyncForce(false, true), true);
  assert.equal(mergeSyncForce(true, false), true);
  assert.equal(mergeSyncForce(false, false), false);
});

test("retryable pull failures schedule a bounded next attempt", () => {
  const now = Date.parse("2026-10-21T20:00:00.000Z");
  assert.equal(getPullRetryAt(true, now), new Date(now + SYNC_PULL_RETRY_DELAY_MS).toISOString());
  assert.equal(getPullRetryAt(false, now), null);
  assert.ok(SYNC_PULL_RETRY_DELAY_MS <= 60_000);
});

test("a blocked photo schedules its own background check without delaying earlier queue work", async () => {
  const { nextSyncRetryAt } = await import("./syncRetry.js");
  const nextPhotoProbeAt = "2026-11-01T10:05:00.000Z";
  const nextRetryAt = "2026-11-01T10:01:00.000Z";
  assert.equal(nextSyncRetryAt("user-action-required", { nextPhotoProbeAt }), nextPhotoProbeAt);
  assert.equal(nextSyncRetryAt("user-action-required", { nextPhotoProbeAt, nextRetryAt }), nextRetryAt);
  assert.equal(nextSyncRetryAt("synced", { nextPhotoProbeAt }), null);
});
