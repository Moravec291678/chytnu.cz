import assert from "node:assert/strict";
import test from "node:test";
import { blockZeroCostQuota, createZeroCostQuota, ZERO_COST_AI_LIMITS } from "./zeroCostQuota.js";

const Timestamp = { fromMillis: (value) => ({ milliseconds: value }) };
function database() {
  const records = new Map();
  let previous = Promise.resolve();
  const db = { records, doc: (path) => ({ path }), runTransaction(operation) {
    const result = previous.then(async () => {
      const writes = [];
      const value = await operation({
        get: async ({ path }) => ({ exists: records.has(path), data: () => structuredClone(records.get(path)) }),
        set: ({ path }, data) => writes.push([path, structuredClone(data)]),
      });
      for (const [path, data] of writes) records.set(path, data);
      return value;
    });
    previous = result.catch(() => {});
    return result;
  } };
  return db;
}

test("concurrent users share an atomic global daily ceiling without exceeding reservations", async () => {
  const db = database();
  const consume = createZeroCostQuota({ db, Timestamp, now: () => Date.parse("2026-11-04T10:00:00Z") });
  const allowed = await Promise.all(Array.from({ length: 20 }, (_, index) => consume(`user-${index}`)));
  assert.equal(allowed.filter(Boolean).length, 3);
  const global = db.records.get("serverRateLimits/ai-free-cloudflare-global");
  assert.equal(global.reservedNeurons, ZERO_COST_AI_LIMITS.globalDailyReservation);
  assert.ok([...db.records.keys()].every((key) => !/user-[0-9]+$/.test(key)));
  assert.equal(db.records.size, 4);
});

test("concurrent retries from one user consume one daily reservation and do not consume rejected credits", async () => {
  const db = database();
  const consume = createZeroCostQuota({ db, Timestamp, now: () => 1_000_000 });
  const allowed = await Promise.all(Array.from({ length: 10 }, () => consume("one-user")));
  assert.equal(allowed.filter(Boolean).length, 1);
  assert.equal(db.records.get("serverRateLimits/ai-free-cloudflare-global").reservedNeurons, 2500);
  assert.equal(db.records.size, 2);
});

test("quota resets at UTC midnight and failed requests are not refunded", async () => {
  const db = database();
  let clock = Date.parse("2026-11-04T23:59:59Z");
  const consume = createZeroCostQuota({ db, Timestamp, now: () => clock });
  assert.equal(await consume("owner"), true);
  // Even if the later provider call times out, there is no refund API.
  assert.equal(await consume("owner"), false);
  clock = Date.parse("2026-11-05T00:00:00Z");
  assert.equal(await consume("owner"), true);
  const global = db.records.get("serverRateLimits/ai-free-cloudflare-global");
  assert.equal(global.reservedNeurons, 2500);
  assert.equal(global.expiresAt.milliseconds, Date.parse("2026-11-07T00:00:00Z"));
});

test("quota fails closed for missing dependencies, larger configurable limits, invalid identity, storage outage and corrupt counters", async () => {
  const db = database();
  assert.throws(() => createZeroCostQuota({ db }), TypeError);
  assert.throws(() => createZeroCostQuota({ db, Timestamp, globalDailyReservation: 10_000 }), TypeError);
  assert.throws(() => createZeroCostQuota({ db, Timestamp, perUserDailyReservation: 5000 }), TypeError);
  const consume = createZeroCostQuota({ db, Timestamp, now: () => 100_000 });
  for (const uid of [null, "", "owner/path", "x".repeat(129)]) assert.equal(await consume(uid), false);
  assert.equal(db.records.size, 0);
  db.records.set("serverRateLimits/ai-free-cloudflare-global", { dayUtc: 0, reservedNeurons: -1000 });
  assert.equal(await consume("owner"), false);
  db.records.set("serverRateLimits/ai-free-cloudflare-global", { dayUtc: 1, reservedNeurons: 0 });
  assert.equal(await consume("owner"), false);
  const unavailable = createZeroCostQuota({ db: { doc: db.doc, runTransaction: async () => { throw new Error("offline"); } }, Timestamp });
  assert.equal(await unavailable("owner"), false);
});

test("account quota circuit breaker is persistent across instances and resets at the next UTC day", async () => {
  const db = database();
  let clock = Date.parse("2026-11-04T23:59:59Z");
  const options = { db, Timestamp, now: () => clock };
  assert.equal(await createZeroCostQuota(options)("first-owner"), true);
  assert.equal(await blockZeroCostQuota(options), true);
  assert.equal(await createZeroCostQuota(options)("second-owner"), false);
  assert.equal(await createZeroCostQuota(options)("third-owner"), false);
  clock = Date.parse("2026-11-05T00:00:00Z");
  assert.equal(await createZeroCostQuota(options)("second-owner"), true);
  assert.equal(db.records.get("serverRateLimits/ai-free-cloudflare-global").reservedNeurons, 2500);
  assert.equal(await blockZeroCostQuota({}), false);
});
