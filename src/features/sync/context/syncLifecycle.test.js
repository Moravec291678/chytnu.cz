import test from "node:test";
import assert from "node:assert/strict";
import { attachSyncLifecycle } from "./syncLifecycle.js";

function eventTarget() {
  const listeners = new Map();
  return {
    navigator: { onLine: true },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
    fire(name) { listeners.get(name)?.(); },
    setInterval(callback) { this.interval = callback; return 1; },
    clearInterval() { this.interval = null; },
  };
}

test("sync lifecycle pulls on foreground, resume, online, and visible polling", () => {
  const win = eventTarget();
  const doc = { visibilityState: "hidden", addEventListener: win.addEventListener.bind(win), removeEventListener: win.removeEventListener.bind(win), fire: win.fire.bind(win) };
  let calls = 0;
  const detach = attachSyncLifecycle({ windowObject: win, documentObject: doc, runSync: () => { calls += 1; }, intervalMs: 10 });
  doc.visibilityState = "visible";
  doc.fire("visibilitychange");
  assert.equal(calls, 1);
  win.fire("focus");
  assert.equal(calls, 1, "near-simultaneous resume events are coalesced");
  win.navigator.onLine = false;
  win.fire("online");
  assert.equal(calls, 1);
  win.navigator.onLine = true;
  win.interval();
  assert.equal(calls, 1, "poll is throttled shortly after the resume");
  detach();
  assert.equal(win.interval, null);
});

test("temporary pull failure is retried when the app returns online and to foreground", () => {
  const win = eventTarget();
  const doc = { visibilityState: "hidden", addEventListener: win.addEventListener.bind(win), removeEventListener: win.removeEventListener.bind(win), fire: win.fire.bind(win) };
  const attempts = [];
  const detach = attachSyncLifecycle({ windowObject: win, documentObject: doc,
    runSync: () => { attempts.push("retry"); }, intervalMs: 45_000 });
  win.navigator.onLine = false;
  win.fire("online");
  assert.equal(attempts.length, 0);
  win.navigator.onLine = true;
  doc.visibilityState = "visible";
  doc.fire("visibilitychange");
  assert.deepEqual(attempts, ["retry"]);
  detach();
});
