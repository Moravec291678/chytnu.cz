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
