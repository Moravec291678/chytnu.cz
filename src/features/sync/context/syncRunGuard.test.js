import assert from "node:assert/strict";
import test from "node:test";
import { readWithDeadline, createLatestSyncSnapshot } from "./syncRunGuard.js";

test("stalled local summary releases its waiter and later reads can recover", async () => {
  let expire;
  let lateResolve;
  let cleared = false;
  const stalled = readWithDeadline(() => new Promise((resolve) => { lateResolve = resolve; }), {
    setTimer: (callback) => { expire = callback; return 1; }, clearTimer: () => { cleared = true; },
  });
  await Promise.resolve();
  expire();
  await assert.rejects(stalled, { code: "unavailable" });
  lateResolve({ pending: 99 });
  assert.equal(cleared, true);
  assert.deepEqual(await readWithDeadline(() => ({ pending: 0 })), { pending: 0 });
});

test("newer refresh and account changes invalidate an earlier async snapshot", () => {
  const snapshots = createLatestSyncSnapshot();
  const first = snapshots.next();
  const second = snapshots.next();
  assert.equal(snapshots.current(first), false);
  assert.equal(snapshots.current(second), true);
  snapshots.invalidate();
  snapshots.invalidate();
  assert.equal(snapshots.current(second), false, "returning to the old account cannot revive its previous result");
});
