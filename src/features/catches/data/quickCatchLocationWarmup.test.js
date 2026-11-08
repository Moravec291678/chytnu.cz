import test from "node:test";
import assert from "node:assert/strict";
import { createQuickCatchLocationWarmup, QUICK_CATCH_LOCATION_TIMEOUT_MS } from "./quickCatchLocationWarmup.js";

const base = Date.parse("2026-11-08T12:00:00Z");
const location = (at = base, overrides = {}) => ({ source: "live-gps", capturedAt: new Date(at).toISOString(),
  coordinates: { latitude: 49.1, longitude: 14.2 }, accuracyMeters: 15, ...overrides });

test("existing collector integration requests GPS only with granted permission and works while offline", async () => {
  const { collectQuickCatchLocation } = await import("./quickCatchEnrichment.js");
  const now = Date.now();
  for (const permission of ["granted", "prompt", "denied", "unknown"]) {
    let called = 0;
    const navigatorObject = { onLine: false, permissions: { query: async () => ({ state: permission }) },
      geolocation: { getCurrentPosition: success => { called++; success({ timestamp: now,
        coords: { latitude: 49.1, longitude: 14.2, accuracy: 15 } }); } } };
    const warmup = createQuickCatchLocationWarmup({ clock: () => now,
      collectLocation: options => collectQuickCatchLocation({ ...options, navigatorObject }) });
    await warmup.begin("account:A");
    assert.equal(called, permission === "granted" ? 1 : 0);
    assert.equal(Boolean(warmup.take("account:A", now)), permission === "granted");
  }
});

test("camera warmup uses one bounded collector and consumes fresh owner-scoped GPS only once, without internet", async () => {
  let calls = 0;
  const warmup = createQuickCatchLocationWarmup({ clock: () => base + 15_000,
    collectLocation: async options => {
      calls++;
      assert.equal(options.timeoutMs, QUICK_CATCH_LOCATION_TIMEOUT_MS);
      return location(base + 15_000);
    } });
  await warmup.begin("account:A");
  assert.equal(warmup.take("account:B", base + 20_000), null);
  assert.deepEqual(warmup.take("account:A", base + 20_000), location(base + 15_000));
  assert.equal(warmup.take("account:A", base + 20_000), null);
  assert.equal(calls, 1);
});

test("stale, future, imprecise, missing and non-device evidence never become a catch location", async () => {
  const cases = [location(base - 60_001), location(base + 5_001), location(base, { accuracyMeters: 151 }),
    location(base, { accuracyMeters: 0 }), location(base, { source: "manual" }),
    location(base, { coordinates: { latitude: null, longitude: null } }),
    location(base, { coordinates: { latitude: 91, longitude: 14 } }), null];
  for (const evidence of cases) {
    const warmup = createQuickCatchLocationWarmup({ clock: () => base, collectLocation: async () => evidence });
    await warmup.begin("account:A");
    assert.equal(warmup.take("account:A", base), null);
  }
});

test("changing owner or opening another camera invalidates late results of the previous operation", async () => {
  let resolveOld;
  const warmup = createQuickCatchLocationWarmup({ clock: () => base });
  const first = warmup.begin("account:A", { collectLocation: () => new Promise(resolve => { resolveOld = resolve; }) });
  await Promise.resolve();
  await warmup.begin("account:B", { collectLocation: async () => location(base, { coordinates: { latitude: 50, longitude: 15 } }) });
  resolveOld(location());
  await first;
  assert.equal(warmup.take("account:A", base), null);
  assert.deepEqual(warmup.take("account:B", base).coordinates, { latitude: 50, longitude: 15 });
});

test("pending GPS never blocks taking a photo, and late callbacks cannot resurrect consumed or cleared evidence", async () => {
  let resolve;
  const warmup = createQuickCatchLocationWarmup({ clock: () => base,
    collectLocation: () => new Promise(done => { resolve = done; }) });
  const pending = warmup.begin("account:A");
  await Promise.resolve();
  assert.equal(warmup.take("account:A", base), null);
  resolve(location());
  await pending;
  assert.equal(warmup.take("account:A", base), null);
  await warmup.begin("account:A", { collectLocation: async () => location() });
  warmup.clear("account:A");
  assert.equal(warmup.take("account:A", base), null);
});

test("another camera opening for the same owner fences the old operation and immediate cancellation starts no GPS", async () => {
  let resolveOld, calls = 0;
  const warmup = createQuickCatchLocationWarmup({ clock: () => base });
  const old = warmup.begin("account:A", { collectLocation: () => new Promise(resolve => { resolveOld = resolve; }) });
  await Promise.resolve();
  await warmup.begin("account:A", { collectLocation: async () => location(base, { accuracyMeters: 8 }) });
  resolveOld(location());
  await old;
  assert.equal(warmup.take("account:A", base).accuracyMeters, 8);
  const canceled = warmup.begin("account:A", { collectLocation: async () => { calls++; return location(); } });
  warmup.clear("account:A");
  await canceled;
  assert.equal(calls, 0);
});

test("reopening cannot reuse an old camera session; hung or failed GPS expires after four seconds", async () => {
  let now = base, expire, resolveLate;
  const warmup = createQuickCatchLocationWarmup({ clock: () => now,
    setTimer: (callback, duration) => { assert.equal(duration, 4_000); expire = callback; return 1; }, clearTimer: () => {} });
  const pending = warmup.begin("account:A", { collectLocation: () => new Promise(resolve => { resolveLate = resolve; }) });
  await Promise.resolve();
  expire();
  await pending;
  resolveLate(location());
  await Promise.resolve();
  assert.equal(warmup.take("account:A", base), null);
  await warmup.begin("account:A", { collectLocation: async () => location() });
  now += 60_001;
  assert.equal(warmup.take("account:A", base), null);
  assert.equal(createQuickCatchLocationWarmup().take("account:A", base), null);
  await warmup.begin("account:A", { collectLocation: async () => { throw new Error("GPS unavailable"); } });
  assert.equal(warmup.take("account:A", now), null);
});
