import assert from "node:assert/strict";
import test from "node:test";
import { finishSyncCycle, getPullRetryAt, isDueForSync, manualSyncAllowed, parseRetryAfter, syncRetryAt, SYNC_PULL_RETRY_DELAY_MS } from "./syncRetry.js";

test("retryable pull failures schedule a bounded next attempt", () => {
  const now = Date.parse("2026-10-21T20:00:00.000Z");
  assert.equal(getPullRetryAt(true, now, 1, null, () => .5), new Date(now + SYNC_PULL_RETRY_DELAY_MS).toISOString());
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

test("manual retries use a durable budget that automatic attempts do not consume", () => {
  const error = { status: "retry-wait", errorCode: "unavailable", backoff: true };
  let control = finishSyncCycle({}, error, 1000);
  for (let i = 1; i <= 3; i++) {
    assert.equal(manualSyncAllowed(control, 1000), true);
    control = finishSyncCycle({ ...control, manualAttempts: i }, error, 1000);
    control = finishSyncCycle(JSON.parse(JSON.stringify(control)), error, 1000);
    assert.equal(control.manualAttempts, i);
  }
  assert.equal(manualSyncAllowed(control, 1000), false);
  assert.equal(manualSyncAllowed(finishSyncCycle(control, { status: "synced" }, 1000)), true);
});

test("429 or 503 retry dates outrank manual force and exponential jitter", () => {
  const now = 1000;
  const retryAfterAt = parseRetryAfter("120", now);
  assert.equal(retryAfterAt, 121000);
  assert.equal(parseRetryAfter(new Date(121000).toUTCString(), now), retryAfterAt);
  assert.equal(parseRetryAfter("bad", now), null);
  assert.equal(isDueForSync({ status: "failed", retryAfterAt }, { now, force: true }), false);
  assert.equal(isDueForSync({ status: "conflict" }, { now, force: true }), false);
  assert.equal(isDueForSync({ status: "failed", retryAfterAt }, { now: retryAfterAt }), true);
  assert.equal(syncRetryAt(1, { now, retryAfterAt }), new Date(retryAfterAt).toISOString());
  assert.notEqual(syncRetryAt(4, { now, random: () => 0 }), syncRetryAt(4, { now, random: () => 1 }));
  assert.equal(syncRetryAt(40, { now }), new Date(now + 30 * 60_000).toISOString());
});
