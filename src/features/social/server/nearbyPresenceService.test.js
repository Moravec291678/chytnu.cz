import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanupExpiredNearbyPresence, coarseNearbyCell, createNearbyPresenceService, NEARBY_PRESENCE_TTL_MS } from "./nearbyPresenceService.js";

function fixture() {
  let time = 1_800_000_000_000;
  const rows = new Map();
  const consents = new Map();
  const db = {
    doc(path) { const store = path.startsWith("nearbyPresence/") ? rows : consents; return { path,
      get: async () => ({ ref: db.doc(path), exists: store.has(path), data: () => store.get(path) }), set: async value => store.set(path, value), delete: async () => store.delete(path) }; },
    batch() { const deletes = []; return { delete: ref => deletes.push(ref.path), commit: async () => deletes.forEach(path => rows.delete(path)) }; },
    async runTransaction(work) { return work({ get: ref => ref.get(), set: (ref, value) => ref.set(value), delete: ref => ref.delete() }); },
    collection() {
      let cell, expiry, expiryOp, limit;
      const query = { where(field, op, value) { if (field === "coarseCell") cell = value; if (field === "expiresAt") { expiry = value; expiryOp = op; } return query; }, limit(value) { limit = value; return query; },
        get: async () => { const docs = [...rows.entries()].filter(([, row]) => (cell === undefined || row.coarseCell === cell)
          && (expiry === undefined || (expiryOp === ">" ? row.expiresAt > expiry : row.expiresAt <= expiry))).slice(0, limit ?? 50)
          .map(([path, value]) => ({ ref: db.doc(path), data: () => value })); return { size: docs.length, empty: docs.length === 0, docs }; } };
      return query;
    },
  };
  return { db, service: createNearbyPresenceService({ db, now: () => time }), rows, consents, setTime: value => { time = value; }, now: () => time };
}

test("Nearby precision is reduced server-side to a stable four-character cell", () => {
  assert.match(coarseNearbyCell(50.087, 14.421), /^[0-9bcdefghjkmnpqrstuvwxyz]{4}$/);
  assert.equal(coarseNearbyCell(50.087, 14.421), coarseNearbyCell(50.0871, 14.4211));
  for (const point of [[91, 0], [0, -181], [NaN, 0]]) assert.throws(() => coarseNearbyCell(...point), /invalid_request/);
});

test("presence requires explicit consent, never returns position, and only reveals a thresholded count", async () => {
  const f = fixture(), point = { latitude: 50.087, longitude: 14.421 };
  await assert.rejects(f.service.join("u0", point), /consent_required/);
  for (let i = 0; i < 4; i++) { await f.service.setConsent(`u${i}`, true); assert.equal((await f.service.join(`u${i}`, point)).nearbyCount, null); }
  await f.service.setConsent("u4", true);
  const fifth = await f.service.join("u4", point);
  assert.equal(fifth.nearbyCount, "5+"); assert.equal(fifth.expiresAt, f.now() + NEARBY_PRESENCE_TTL_MS);
  assert.equal(Object.hasOwn(fifth, "latitude"), false); assert.equal(Object.hasOwn(fifth, "longitude"), false);
  assert.ok([...f.rows.values()].every(row => !Object.hasOwn(row, "latitude") && !Object.hasOwn(row, "longitude")));
  await f.service.setConsent("u4", false);
  assert.equal(f.rows.size, 4);
  await assert.rejects(f.service.join("u4", point), /consent_required/);
});

test("Nearby leave is immediate and expired sessions do not count", async () => {
  const f = fixture(), point = { latitude: 50.087, longitude: 14.421, consent: true };
  for (let i = 0; i < 5; i++) { await f.service.setConsent(`u${i}`, true); await f.service.join(`u${i}`, point); }
  await f.service.leave("u4"); await f.service.leave("u3");
  await f.service.setConsent("u5", true);
  assert.equal((await f.service.join("u5", point)).nearbyCount, null);
  for (let i = 0; i < 4; i++) { await f.service.setConsent(`v${i}`, true); await f.service.join(`v${i}`, point); }
  f.setTime(f.now() + NEARBY_PRESENCE_TTL_MS + 1);
  await f.service.setConsent("v4", true);
  assert.equal((await f.service.join("v4", point)).nearbyCount, null);
});

test("daily cleanup deletes only expired bounded presence records", async () => {
  const f = fixture(), point = { latitude: 50.087, longitude: 14.421, consent: true };
  for (const uid of ["active", "stale-one", "stale-two"]) { await f.service.setConsent(uid, true); await f.service.join(uid, point); }
  f.setTime(f.now() + NEARBY_PRESENCE_TTL_MS + 1);
  await f.service.setConsent("new", true); await f.service.join("new", point);
  const result = await cleanupExpiredNearbyPresence({ db: f.db, now: f.now, limit: 1 });
  assert.deepEqual(result, { deleted: 1, more: true });
  assert.equal(f.rows.size, 3);
  const rest = await cleanupExpiredNearbyPresence({ db: f.db, now: f.now, limit: 10 });
  assert.deepEqual(rest, { deleted: 2, more: false });
  assert.equal(f.rows.size, 1);
});

test("cleanup preserves a presence renewed after the expiry query", async () => {
  const f = fixture();
  const point = { latitude: 50, longitude: 14 };
  await f.service.setConsent("renewed", true);
  await f.service.join("renewed", point);
  f.setTime(f.now() + NEARBY_PRESENCE_TTL_MS + 1);
  const transaction = f.db.runTransaction;
  f.db.runTransaction = async work => {
    f.db.runTransaction = transaction;
    await f.service.join("renewed", point);
    return transaction(work);
  };
  assert.equal((await cleanupExpiredNearbyPresence({ db: f.db, now: f.now })).deleted, 0);
  assert.equal(f.rows.size, 1);
});
