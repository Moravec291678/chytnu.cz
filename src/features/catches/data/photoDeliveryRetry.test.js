import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { startPhotoDelivery } from "./photoDeliveryRetry.js";
import { getPhotoAvailability } from "./photoAvailability.js";

test("delivery 200 clears spinner even while the original remote photo has no local Blob", async () => {
  const item = { cloud: { state: "synced", provider: "fake", objectKey: "key", sha256: "a".repeat(64) } };
  const blob = new Blob(["image"]);
  let state;
  const stop = startPhotoDelivery({ load: async () => blob, onState: (next) => { state = next; }, events: new EventTarget() });
  await setImmediate();
  assert.equal(getPhotoAvailability(item, { loadState: state.status, resolvedBlob: state.blob }), "available");
  assert.equal(item.blob, undefined);
  stop();
});

test("transient delivery retries in background and success clears error; unmount cancels retry", async () => {
  let attempt = 0;
  let retry;
  let state;
  const stop = startPhotoDelivery({ events: new EventTarget(), schedule: (fn) => { retry = fn; return 1; }, cancel: () => {},
    load: async () => { if (++attempt === 1) throw { code: "photo_cloud_network_error" }; return new Blob(["image"]); },
    onState: (next) => { state = next; } });
  await setImmediate();
  assert.equal(state.status, "error");
  await retry();
  assert.equal(state.status, "ready");
  assert.equal(state.errorCode, "");
  stop();
  await retry();
  assert.equal(attempt, 2);
});

test("stale metadata resumes immediately on realtime, without periodic polling", async () => {
  const events = new EventTarget();
  let serverReady = false;
  let state;
  const stop = startPhotoDelivery({ events, schedule: () => assert.fail("no periodic polling"),
    load: async () => serverReady ? new Blob(["image"]) : null, onState: (next) => { state = next; } });
  await setImmediate();
  serverReady = true;
  events.dispatchEvent(new Event("chytnu:local-data-restored"));
  await setImmediate();
  assert.equal(state.status, "ready");
  stop();
});


test("READY realtime received during a stale load is not lost", async () => {
  const events = new EventTarget();
  let complete;
  let calls = 0;
  let state;
  const stop = startPhotoDelivery({ events,
    load: async () => ++calls === 1 ? new Promise((resolve) => { complete = resolve; }) : new Blob(["ready"]),
    onState: (next) => { state = next; } });
  events.dispatchEvent(new Event("chytnu:local-data-restored"));
  complete(null);
  await setImmediate();
  assert.equal(state.status, "ready");
  assert.equal(calls, 2);
  stop();
});
