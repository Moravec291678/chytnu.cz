import test from "node:test";
import assert from "node:assert/strict";
import catalogue from "../../../../public/data/ris/be90ad549cf77679/index.json" with { type: "json" };
import { createWaterPresenceService, WATER_PRESENCE_TTL_MS } from "./waterPresenceService.js";

function fixture() {
  const records = new Map();
  let time = 1_800_000_000_000;
  const db = {
    doc: path => path,
    runTransaction: async work => work({
      get: async path => ({ exists: records.has(path), data: () => records.get(path) }),
      set: (path, value) => records.set(path, value),
      delete: path => records.delete(path),
    }),
  };
  const service = createWaterPresenceService({ db, now: () => time });
  return { service, db, records, advance: ms => { time += ms; } };
}

test("only explicitly confirmed canonical RIS waters receive owner-scoped presence without GPS", async () => {
  const { service, records } = fixture();
  const waterId = catalogue[0].id;
  assert.throws(() => service.join("actor", { waterId, confirmed: false }), /invalid_request/);
  assert.throws(() => service.join("actor", { waterId: "ris-000000000000000000000000", confirmed: true }), /invalid_request/);
  const session = await service.join("actor", { waterId, confirmed: true });
  assert.deepEqual(await service.status("other"), { active: false });
  assert.throws(() => service.leave("other", "not-a-session"), /invalid_request/);
  assert.deepEqual(await service.leave("other", session.sessionId), { active: false });
  assert.deepEqual(await service.status("actor"), session);
  assert.deepEqual(Object.keys([...records.values()][0]).sort(), ["createdAt", "expiresAt", "ownerUid", "sessionId", "updatedAt", "waterId"]);
});

test("refresh rotates the session and stale devices cannot overwrite or revoke a newer choice", async () => {
  const { service, db, advance } = fixture();
  const first = await service.join("actor", { waterId: catalogue[0].id, confirmed: true });
  await assert.rejects(service.join("actor", { waterId: catalogue[1].id, confirmed: true }), /water_presence_conflict/);
  advance(1_000);
  const refreshed = await service.refresh("actor", first.sessionId);
  assert.notEqual(first.sessionId, refreshed.sessionId);
  assert.equal(refreshed.expiresAt, first.expiresAt + 1_000);
  await assert.rejects(service.leave("actor", first.sessionId), /water_presence_conflict/);
  const moved = await service.join("actor", { waterId: catalogue[1].id, confirmed: true, expectedSessionId: refreshed.sessionId });
  await assert.rejects(db.runTransaction(tx => service.authorize(tx, "actor", catalogue[0].id)), /water_presence_required/);
  assert.deepEqual(await db.runTransaction(tx => service.authorize(tx, "actor", catalogue[1].id)), moved);
  advance(WATER_PRESENCE_TTL_MS);
  assert.deepEqual(await service.status("actor"), { active: false });
  await assert.rejects(service.refresh("actor", moved.sessionId), /water_presence_conflict/);
  await assert.rejects(db.runTransaction(tx => service.authorize(tx, "actor", catalogue[1].id)), /water_presence_required/);
});

test("suspension and feature disablement deny access while owners retain their stop action", async () => {
  const { service, db, records } = fixture();
  const waterId = catalogue[0].id, session = await service.join("actor", { waterId, confirmed: true });
  records.set("accountSuspensions/actor", {});
  await assert.rejects(service.status("actor"), /account_unavailable/);
  await assert.rejects(db.runTransaction(tx => service.authorize(tx, "actor", waterId)), /account_unavailable/);
  assert.deepEqual(await service.leave("actor", session.sessionId), { active: false });
  records.delete("accountSuspensions/actor");
  records.set("adminConfig/social", { waterPresenceEnabled: false });
  await assert.rejects(service.join("actor", { waterId, confirmed: true }), /social_disabled/);
});
