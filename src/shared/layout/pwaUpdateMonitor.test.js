import test from "node:test";
import assert from "node:assert/strict";
import { monitorPwaUpdates } from "./pwaUpdateMonitor.js";

function eventTarget(properties = {}) {
  const handlers = new Map();
  return { ...properties,
    addEventListener(type, handler) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(handler); },
    removeEventListener(type, handler) { handlers.get(type)?.delete(handler); },
    dispatch(type) { for (const handler of handlers.get(type) ?? []) handler(); },
  };
}

test("checks service worker on launch, app focus and periodically without changing data storage", async () => {
  let checks = 0, timer, interval, cleared = null;
  const registration = eventTarget({ waiting: null, update: async () => { checks++; } });
  const serviceWorker = eventTarget({ controller: {} });
  serviceWorker.getRegistration = async () => registration;
  const windowObject = eventTarget();
  const documentObject = eventTarget({ visibilityState: "visible" });
  const monitor = monitorPwaUpdates({ serviceWorker, windowObject, documentObject, onAvailable() {},
    intervalMs: 30_000, setIntervalFn(callback, ms) { timer = callback; interval = ms; return 7; },
    clearIntervalFn(id) { cleared = id; } });
  await monitor.ready;
  assert.equal(checks, 1);
  assert.equal(interval, 30_000);
  windowObject.dispatch("focus"); await Promise.resolve();
  assert.equal(checks, 2);
  documentObject.visibilityState = "hidden";
  documentObject.dispatch("visibilitychange"); await Promise.resolve();
  assert.equal(checks, 2);
  documentObject.visibilityState = "visible";
  timer(); await Promise.resolve();
  assert.equal(checks, 3);
  monitor.dispose();
  assert.equal(cleared, 7);
  assert.equal(registration.listenerCount?.("updatefound") ?? 0, 0);
});

test("notifies a controlled client for waiting or installing updates, not first-time control", async () => {
  let updateWorker;
  const worker = eventTarget({ state: "installing" });
  const registration = eventTarget({
    waiting: null,
    async update() { updateWorker = worker; registration.dispatch("updatefound"); },
  });
  Object.defineProperty(registration, "installing", { get: () => updateWorker });
  const serviceWorker = eventTarget({ controller: {} });
  serviceWorker.getRegistration = async () => registration;
  let notices = 0;
  const monitor = monitorPwaUpdates({ serviceWorker, onAvailable: () => notices++,
    setIntervalFn: () => null, clearIntervalFn() {} });
  await monitor.ready;
  assert.equal(notices, 0);
  worker.state = "installed"; worker.dispatch("statechange");
  assert.equal(notices, 1);
  registration.waiting = {};
  await monitor.check();
  assert.equal(notices, 2);
  monitor.dispose();

  const firstInstallServiceWorker = eventTarget({ controller: null });
  firstInstallServiceWorker.getRegistration = async () => null;
  let firstInstallNotices = 0;
  const firstInstall = monitorPwaUpdates({ serviceWorker: firstInstallServiceWorker,
    onAvailable: () => firstInstallNotices++, setIntervalFn: () => null, clearIntervalFn() {} });
  firstInstallServiceWorker.controller = {};
  firstInstallServiceWorker.dispatch("controllerchange");
  assert.equal(firstInstallNotices, 0);
  firstInstall.dispose();
});
