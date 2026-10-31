import test from "node:test";
import assert from "node:assert/strict";
import { withPhotoDeadline } from "./photoDeadline.js";

test("hung network/body aborts and releases worker for retry; success returns normally", async () => {
  let signal;
  await assert.rejects(withPhotoDeadline((value) => { signal = value; return new Promise(() => {}); }, 5), { code: "photo_cloud_timeout" });
  assert.equal(signal.aborted, true);
  assert.equal(await withPhotoDeadline(async () => "ready", 5), "ready");
});


test("permanent photo problem preserves another photo retry; pending gets a watchdog and success clears it", async () => {
  const { nextSyncRetryAt } = await import("../../sync/context/syncRetry.js");
  assert.equal(nextSyncRetryAt("user-action-required", { nextRetryAt: "later" }), "later");
  assert.ok(Date.parse(nextSyncRetryAt("local-pending", {}, 1000)) > 1000);
  assert.equal(nextSyncRetryAt("synced", { nextRetryAt: "stale" }), null);
});
