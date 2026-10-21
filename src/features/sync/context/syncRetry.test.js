import assert from "node:assert/strict";
import test from "node:test";
import { mergeSyncForce } from "./syncRetry.js";

test("force retry remains queued while sync is already running", () => {
  assert.equal(mergeSyncForce(false, true), true);
  assert.equal(mergeSyncForce(true, false), true);
  assert.equal(mergeSyncForce(false, false), false);
});
