import assert from "node:assert/strict";
import { test } from "node:test";
import { createAvatarCoordinator } from "./socialAvatarCoordinator.js";

function fixture() {
  const rows = new Map([["publicProfiles/A", { uid: "A", handle: "angler_a" }]]);
  let queue = Promise.resolve(), time = 1_800_000_000_000;
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const ref = path => ({ path, id: path.split("/").at(-1),
    async get() { return { exists: rows.has(path), ref: ref(path), data: () => clone(rows.get(path)) }; },
    async set(data) { rows.set(path, clone(data)); }, async delete() { rows.delete(path); },
  });
  const db = { doc: ref, collection(path) {
    const filters = []; let max = 20;
    const query = { where(field, op, value) { assert.equal(op, "=="); filters.push([field, value]); return query; },
      limit(value) { assert.ok(value > 0); max = value; return query; }, async get() {
        const paths = [...rows].filter(([key, row]) => key.startsWith(`${path}/`) && filters.every(([field, value]) => row[field] === value)).slice(0, max);
        return { size: paths.length, docs: await Promise.all(paths.map(([key]) => ref(key).get())) };
      } }; return query;
  }, runTransaction(callback) {
    const run = queue.then(async () => {
      const writes = []; let writing = false;
      const result = await callback({
        async get(document) { assert.equal(writing, false, "All transaction reads must precede writes"); return document.get(); },
        create(document, data) { writing = true; assert.equal(rows.has(document.path), false); writes.push([document.path, clone(data)]); },
        set(document, data) { writing = true; writes.push([document.path, clone(data)]); },
      });
      for (const [path, data] of writes) rows.set(path, data);
      return result;
    }); queue = run.catch(() => {}); return run;
  } };
  const removed = [], uploads = [], assets = new Set(); let saveHook = null, failRemove = false;
  const avatar = {
    async save(uid, bytes, assetId) { uploads.push(assetId); assets.add(assetId); await saveHook?.(uid, assetId); return { version: "123" }; },
    async remove(uid, assetId) { assert.equal(uid, "A"); removed.push(assetId); if (failRemove) throw new Error("Synthetic provider unavailable"); assets.delete(assetId); },
  };
  const coordinator = createAvatarCoordinator({ db, avatar, now: () => time });
  return { db, rows, assets, removed, uploads, coordinator, setSaveHook(value) { saveHook = value; }, setFailRemove(value) { failRemove = value; },
    advance(ms) { time += ms; } };
}

test("avatar coordinator creates durable intent before upload and attaches an immutable owner asset", async () => {
  const f = fixture();
  f.setSaveHook(async (uid, assetId) => {
    assert.equal(f.rows.get(`socialAvatarJobs/${assetId}`).status, "pending");
    assert.equal(f.rows.get("publicProfiles/A").avatarAssetId, undefined);
  });
  const result = await f.coordinator.save("A", "synthetic");
  assert.match(result.assetId, /^[a-f0-9]{32}$/);
  assert.equal(f.rows.get("publicProfiles/A").avatarAssetId, result.assetId);
  assert.equal(f.rows.get("publicProfiles/A").avatarRevision, 1);
  assert.equal(f.rows.get(`socialAvatarJobs/${result.assetId}`).status, "attached");
});
test("avatar replacement immediately removes only the previous immutable asset and cron never removes current avatar", async () => {
  const f = fixture(), first = await f.coordinator.save("A", "one"), second = await f.coordinator.save("A", "two");
  assert.notEqual(first.assetId, second.assetId);
  assert.equal(f.rows.has(`socialAvatarJobs/${first.assetId}`), false);
  await f.coordinator.cleanupPending();
  assert.deepEqual(f.removed, [first.assetId]);
  assert.equal(f.rows.get("publicProfiles/A").avatarAssetId, second.assetId);
  assert.ok(f.assets.has(second.assetId));
});
test("replacement stays successful when old-asset cleanup fails and retains its durable retry job", async () => {
  const f = fixture(), first = await f.coordinator.save("A", "one");
  f.setFailRemove(true);
  const second = await f.coordinator.save("A", "two");
  assert.equal(f.rows.get("publicProfiles/A").avatarAssetId, second.assetId);
  assert.equal(f.rows.get(`socialAvatarJobs/${first.assetId}`).status, "delete");
  assert.ok(f.assets.has(second.assetId));
  f.setFailRemove(false); await f.coordinator.cleanupPending();
  assert.equal(f.rows.has(`socialAvatarJobs/${first.assetId}`), false);
  assert.ok(f.assets.has(second.assetId));
});
test("concurrent remove wins CAS without the losing upload deleting another operation's asset", async () => {
  const f = fixture(), first = await f.coordinator.save("A", "first");
  f.setSaveHook(async () => { await f.coordinator.remove("A"); });
  await assert.rejects(() => f.coordinator.save("A", "loser"), /avatar_unavailable/);
  assert.equal(f.rows.get("publicProfiles/A").avatarAssetId, undefined);
  assert.equal(f.rows.get("publicProfiles/A").avatarRevision, 2);
  assert.deepEqual(new Set(f.removed), new Set([first.assetId, f.uploads[1]]));
  assert.equal(f.assets.size, 0);
});
test("suspension/deletion during upload denies attachment and cleans its own immutable asset", async () => {
  for (const marker of ["accountSuspensions", "accountDeletions"]) {
    const f = fixture(); f.setSaveHook(async () => { f.rows.set(`${marker}/A`, { ownerId: "A" }); });
    await assert.rejects(() => f.coordinator.save("A", "synthetic"), /account_unavailable/);
    assert.equal(f.rows.get("publicProfiles/A").avatarVersion, undefined);
    assert.equal(f.assets.size, 0);
  }
});
test("two racing uploads preserve the successful operation's immutable asset", async () => {
  const f = fixture(); let winner;
  f.setSaveHook(async () => { f.setSaveHook(null); winner = await f.coordinator.save("A", "winner"); });
  await assert.rejects(() => f.coordinator.save("A", "loser"), /avatar_unavailable/);
  assert.equal(f.rows.get("publicProfiles/A").avatarAssetId, winner.assetId);
  assert.ok(f.assets.has(winner.assetId));
  assert.deepEqual(f.removed, [f.uploads[0]]);
});
test("provider failure leaves durable cleanup and future lease prevents premature destruction", async () => {
  const f = fixture(); f.setSaveHook(async () => { throw new Error("Provider response lost"); });
  await assert.rejects(() => f.coordinator.save("A", "synthetic"), /Provider response lost/);
  const job = f.rows.get(`socialAvatarJobs/${f.uploads[0]}`);
  assert.equal(job.status, "delete");
  await f.coordinator.cleanupPending(); assert.equal(f.removed.length, 0);
  assert.equal(await f.coordinator.cleanup("A"), true); assert.equal(f.removed.length, 0);
  f.advance(120_001); await f.coordinator.cleanupPending();
  assert.equal(f.removed.length, 1); assert.equal(f.assets.size, 0);
  assert.equal(await f.coordinator.cleanup("A"), false);
});
test("account deletion waits for in-flight upload and retries failed provider cleanup durably", async () => {
  const f = fixture();
  f.setSaveHook(async () => {
    assert.equal(await f.coordinator.cleanup("A"), true);
    assert.equal(f.removed.length, 0);
  });
  await f.coordinator.save("A", "synthetic");
  f.setFailRemove(true); await assert.rejects(() => f.coordinator.cleanup("A"), /Synthetic provider unavailable/);
  assert.equal(f.rows.get(`socialAvatarJobs/${f.uploads[0]}`).status, "delete");
  f.setFailRemove(false); assert.equal(await f.coordinator.cleanup("A"), true);
  assert.equal(await f.coordinator.cleanup("A"), false);
  assert.equal(f.assets.size, 0);
});
test("remove clears profile first and preserves retry job when provider is unavailable", async () => {
  const f = fixture(), result = await f.coordinator.save("A", "synthetic");
  f.setFailRemove(true); await f.coordinator.remove("A");
  assert.equal(f.rows.get("publicProfiles/A").avatarAssetId, undefined);
  assert.equal(f.rows.get(`socialAvatarJobs/${result.assetId}`).status, "delete");
  f.setFailRemove(false); await f.coordinator.cleanupPending();
  assert.equal(f.rows.has(`socialAvatarJobs/${result.assetId}`), false);
});
test("global avatar cleanup drains at most one hundred jobs per invocation", async () => {
  const f = fixture();
  for (let i = 0; i < 101; i++) {
    const assetId = i.toString(16).padStart(32, "0");
    f.rows.set(`socialAvatarJobs/${assetId}`, { assetId, ownerUid: "A", status: "delete", leaseUntil: 0 });
  }
  assert.equal(await f.coordinator.cleanupPending(), 100);
  assert.equal(f.removed.length, 100);
  assert.equal([...f.rows.keys()].filter(path => path.startsWith("socialAvatarJobs/")).length, 1);
});
