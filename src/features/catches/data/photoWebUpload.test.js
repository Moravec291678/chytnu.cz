import test from "node:test";
import assert from "node:assert/strict";
import { uploadPhotoWithProgress } from "./photoWebUpload.js";

function harness() {
  const timers = new Map();
  let id = 0;
  const request = { upload: {}, status: 200, responseText: '{"bytes":4}', aborts: 0,
    open() {}, send() {}, abort() { this.aborts++; this.onabort?.(); } };
  const pending = uploadPhotoWithProgress({ url: "https://example.test", form: new FormData(),
    createRequest: () => request, schedule: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    cancel: (key) => timers.delete(key), idleMs: 60, maximumMs: 600 });
  return { request, pending, timers };
}

test("real increasing upload progress extends idle deadline, repeated progress does not", async () => {
  const { request, pending, timers } = harness();
  const firstIdle = [...timers.keys()][0];
  const maximum = [...timers.keys()][1];
  request.upload.onprogress({ loaded: 1 });
  assert.equal(timers.has(firstIdle), false);
  const idle = [...timers.keys()].find((key) => key !== maximum);
  request.upload.onprogress({ loaded: 1 });
  assert.equal(timers.has(idle), true);
  request.upload.onprogress({ loaded: 4 });
  assert.equal(timers.has(idle), false);
  assert.equal(timers.has(maximum), true);
  request.onload();
  assert.equal((await pending).state, "completed");
  assert.equal(timers.size, 0);
  assert.equal(request.upload.onprogress, null);
});

for (const timerMs of [60, 600]) test(`stalled/absolute deadline ${timerMs} aborts and releases upload`, async () => {
  const { request, pending, timers } = harness();
  const rejected = assert.rejects(pending, { code: "photo_cloud_timeout" });
  [...timers.values()].find((timer) => timer.ms === timerMs).fn();
  await rejected;
  assert.equal(request.aborts, 1);
  assert.equal(timers.size, 0);
});

test("HTTP errors retain numeric status and network failure releases all timers", async () => {
  const first = harness();
  first.request.status = 429;
  first.request.onload();
  assert.equal((await first.pending).httpStatus, 429);
  const second = harness();
  const rejected = assert.rejects(second.pending, { code: "cloudinary_network_error" });
  second.request.onerror();
  await rejected;
  assert.equal(second.timers.size, 0);
});
