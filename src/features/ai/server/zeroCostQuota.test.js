import { measuredNeurons, settleCloudflareReservation } from "./cloudflareAccounting.js";
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

test("one user has two atomic daily reservations and rejected requests consume nothing", async () => {
  const db = database();
  const consume = createZeroCostQuota({ db, Timestamp, now: () => 1_000_000 });
  const allowed = await Promise.all(Array.from({ length: 10 }, () => consume("one-user")));
  assert.equal(allowed.filter(Boolean).length, 2);
  assert.equal(db.records.get("serverRateLimits/ai-free-cloudflare-global").reservedNeurons, 5000);
  assert.equal(db.records.size, 2);
});

test("quota resets at UTC midnight and failed requests are not refunded", async () => {
  const db = database();
  let clock = Date.parse("2026-11-04T23:59:59Z");
  const consume = createZeroCostQuota({ db, Timestamp, now: () => clock });
  assert.equal(await consume("owner"), true);
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
  assert.throws(() => createZeroCostQuota({ db, Timestamp, perUserDailyReservation: 10000 }), TypeError);
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

test("detailed quota distinguishes user, global, text reserve, provider circuit and database failure", async () => {
  const db = database(), now = () => Date.parse("2026-11-08T10:00:00Z");
  const options = { db, Timestamp, now, detailed: true };
  const consume = createZeroCostQuota(options);
  assert.equal((await consume("owner", { capability: "home" })).allowed, true);
  assert.equal((await consume("other", { capability: "stories" })).allowed, true);
  assert.equal((await consume("third", { capability: "diary" })).code, "text_daily_limit");
  assert.equal((await consume("owner")).allowed, true);
  assert.equal((await consume("owner")).code, "user_daily_limit");
  assert.equal((await consume("other")).allowed, true);
  const exhausted = await consume("third");
  assert.equal(exhausted.code, "app_daily_limit");
  assert.equal(exhausted.retryAt, "2026-11-09T00:00:00.000Z");
  await blockZeroCostQuota(options);
  assert.equal((await consume("fourth")).code, "provider_quota");
  const broken = createZeroCostQuota({ ...options, db: { doc: db.doc, runTransaction: async () => { throw new Error("private secret"); } } });
  assert.deepEqual(await broken("owner"), { allowed: false, code: "quota_unavailable", retryAt: null });
});

test("configured OWNER bypasses only internal user caps, never global or text safety ceilings or disabled features", async () => {
  const db = database(), options = { db, Timestamp, now: () => Date.parse("2026-11-08T10:00:00Z"), detailed: true, env: { CHYTNU_OWNER_UID: "configured-owner" } };
  const consume = createZeroCostQuota(options);
  for (let i = 0; i < 3; i++) assert.equal((await consume("configured-owner")).allowed, true);
  assert.equal((await consume("configured-owner")).code, "app_daily_limit");
  const ordinary = database(); ordinary.records.set("adminAccounts/forged-owner", { role: "OWNER" });
  const consumeForged = createZeroCostQuota({ ...options, db: ordinary });
  assert.equal((await consumeForged("forged-owner")).allowed, true); assert.equal((await consumeForged("forged-owner")).allowed, true);
  assert.equal((await consumeForged("forged-owner")).code, "user_daily_limit");
  const textDb = database(); const text = createZeroCostQuota({ ...options, db: textDb });
  assert.equal((await text("configured-owner", { capability: "diary" })).allowed, true);
  assert.equal((await text("configured-owner", { capability: "diary" })).allowed, true);
  assert.equal((await text("configured-owner", { capability: "diary" })).code, "text_daily_limit");
  textDb.records.set("adminConfig/runtime", { features: { species: { audience: "disabled", userIds: [] } } });
  assert.equal((await text("configured-owner")).code, "ai_disabled");
});

test("tester and individual limits use fresh server policy; expired overrides and suspensions cannot grant quota", async () => {
  const db = database(), now = () => Date.parse("2026-11-08T10:00:00Z");
  db.records.set("adminConfig/runtime", { limits: { userDailyReservation: 0, testerDailyReservation: 2500 } });
  db.records.set("adminAccounts/tester", { role: "TESTER" });
  const consume = createZeroCostQuota({ db, Timestamp, now, detailed: true });
  assert.equal((await consume("standard")).code, "user_daily_limit");
  assert.equal((await consume("tester")).allowed, true); assert.equal((await consume("tester")).code, "user_daily_limit");
  db.records.set("adminAccounts/temporary", { limits: { dailyReservation: 2500 }, overrideExpiresAt: "2026-11-08T11:00:00Z" });
  assert.equal((await consume("temporary")).allowed, true);
  db.records.set("adminAccounts/expired", { limits: { dailyReservation: 2500 }, overrideExpiresAt: "2026-11-08T09:59:59Z" });
  assert.equal((await consume("expired")).code, "user_daily_limit");
  db.records.set("accountSuspensions/temporary", { suspendedAt: "2026-11-08T10:00:00Z" });
  assert.equal((await consume("temporary")).code, "account_unavailable");
  db.records.set("adminAccounts/tester", { role: "USER" });
  assert.equal((await consume("tester")).code, "user_daily_limit");
});

test("strict OWNER audience and global feature disable cannot be bypassed by individual grants or corrupt runtime limits", async () => {
  const db = database(), options = { db, Timestamp, now: () => Date.parse("2026-11-08T10:00:00Z"), detailed: true };
  db.records.set("adminAccounts/user", { entitlements: { species: true } });
  db.records.set("adminConfig/runtime", { features: { species: { audience: "owner", userIds: [] } } });
  assert.equal((await createZeroCostQuota(options)("user")).code, "ai_disabled");
  db.records.set("adminConfig/runtime", { limits: { globalDailyReservation: 10000 } });
  assert.equal((await createZeroCostQuota(options)("user")).code, "quota_unavailable");
  assert.equal([...db.records.keys()].some(path => path.startsWith("serverRateLimits/")), false);
});


test("CO_CREATOR is exempt, forged metadata is not, and ordinary users cannot consume the collaborator reserve", async () => {
  const now = () => Date.parse("2026-11-08T10:00:00Z"), db = database();
  const env = { CHYTNU_OWNER_UID: "owner", CHYTNU_CO_CREATOR_UID: "co" };
  const consume = createZeroCostQuota({ db, Timestamp, now, env, detailed: true });
  assert.equal((await consume("ordinary-a")).allowed, true);
  assert.equal((await consume("ordinary-b")).allowed, true);
  assert.equal((await consume("ordinary-c")).code, "app_daily_limit");
  assert.equal((await consume("co")).allowed, true);
  assert.equal((await consume("owner")).code, "app_daily_limit");
  const fresh = database(); fresh.records.set("adminAccounts/co", { limits: { dailyReservation: 0 } });
  const privileged = createZeroCostQuota({ db: fresh, Timestamp, now, env, detailed: true });
  for (let i=0; i<3; i++) assert.equal((await privileged("co")).allowed, true);
  assert.equal((await privileged("co")).code, "app_daily_limit");
  const fake = database(); fake.records.set("adminAccounts/fake", { role: "CO_CREATOR", internalLimitExempt: true });
  const untrusted = createZeroCostQuota({ db: fake, Timestamp, now, detailed: true });
  await untrusted("fake"); await untrusted("fake"); assert.equal((await untrusted("fake")).code, "user_daily_limit");
});

test("provider token accounting reconciles once, fences owner/day, and preserves the provider circuit", async () => {
  const time = Date.parse("2026-11-08T10:00:00Z"), db = database(), options = { db, Timestamp, now: () => time, detailed: true, trackUsage: true };
  const usage = { prompt_tokens: 2000, completion_tokens: 100, total_tokens: 2100 };
  assert.equal(measuredNeurons(usage), 21);
  for (const invalid of [null, {}, { ...usage, total_tokens: 2 }, { ...usage, prompt_tokens: -1 }, { ...usage, completion_tokens: 513 }]) assert.equal(measuredNeurons(invalid), null);
  const ticket = await createZeroCostQuota(options)("user");
  const settle = (changes = {}) => settleCloudflareReservation({ db, uid: "user", reservationId: ticket.reservationId, usage, now: time, ...changes });
  assert.equal(await settle({ uid: "other" }), false);
  assert.equal(await settle({ now: time + 86400000 }), false);
  assert.equal(db.records.get("serverRateLimits/ai-free-cloudflare-global").reservedNeurons, 2500);
  await blockZeroCostQuota(options);
  assert.deepEqual(await Promise.all([settle(),settle()]), [true,false]);
  const global = db.records.get("serverRateLimits/ai-free-cloudflare-global");
  assert.equal(global.reservedNeurons, 21); assert.equal(global.ordinaryReservedNeurons, 21);
  assert.equal(global.blockedDay, Math.floor(time/86400000));
  assert.equal((await createZeroCostQuota(options)("other")).code, "provider_quota");
});

test("successful bounded requests use measured totals while unknown usage keeps full reservations", async () => {
  const time = Date.parse("2026-11-08T10:00:00Z"), db = database(), env = { CHYTNU_CO_CREATOR_UID: "co" };
  const consume = createZeroCostQuota({ db, Timestamp, now: () => time, env, detailed: true, trackUsage: true });
  for (let i=0; i<5; i++) {
    const ticket = await consume("co"); assert.equal(ticket.allowed, true);
    assert.equal(await settleCloudflareReservation({ db, uid: "co", reservationId: ticket.reservationId, usage: { prompt_tokens: 2000, completion_tokens: 100, total_tokens: 2100 }, now: time }), true);
  }
  assert.equal(db.records.get("serverRateLimits/ai-free-cloudflare-global").reservedNeurons, 105);
  const ticket = await consume("co");
  assert.equal(await settleCloudflareReservation({ db, uid: "co", reservationId: ticket.reservationId, usage: null, now: time }), false);
  assert.equal(db.records.get("serverRateLimits/ai-free-cloudflare-global").reservedNeurons, 2605);
});
