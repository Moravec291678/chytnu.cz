import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { readSyncSummary } from "./localSyncRepository.js";
import { withAccountSyncLock, writeSyncControl } from "./syncControlRepository.js";

test("pending retry budget and last success survive reopening the same account only", async () => {
  const control = { manualAttempts: 3, failureKey: "unavailable", lastSuccessAt: "2026-11-21T15:00:00.000Z" };
  await writeSyncControl("account-one", control);
  assert.deepEqual((await readSyncSummary("account-one")).control, control);
  assert.deepEqual((await readSyncSummary("account-two")).control, {});
});

test("the IndexedDB fallback holds one account lock until completion and releases after a failure", async () => {
  let start, release;
  const started = new Promise(resolve => { start = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const options = { locks: null };
  const first = withAccountSyncLock("fallback-owner", async () => {
    start();
    await gate;
    throw new Error("simulate interrupted transfer");
  }, options);
  try {
    await started;
    assert.equal(await withAccountSyncLock("fallback-owner", () => assert.fail("duplicate work"), options), false);
    assert.equal(await withAccountSyncLock("different-owner", () => {}, options), true);
  } finally { release(); }
  await assert.rejects(first, /interrupted transfer/);
  assert.equal(await withAccountSyncLock("fallback-owner", () => {}, options), true);
});
