import assert from "node:assert/strict";
import test from "node:test";
import { createCloudinaryPhotoCleanup } from "./cloudinaryApi.js";

function makeSnapshot(path, data) {
  const snapshot = { ref: null, exists: true, data: () => ({ ...data }) };
  snapshot.ref = { path, async delete() { snapshot.exists = false; } };
  return snapshot;
}

function makeDb(records, pageSize) {
  const originals = [...records];
  return {
    collectionGroup(name) {
      assert.equal(name, "photos");
      let cursor = -1;
      return {
        where(field, op, value) { assert.deepEqual([field, op, value], ["deleted", "==", true]); return this; },
        limit(size) { assert.equal(size, pageSize); return this; },
        startAfter(snapshot) { cursor = originals.indexOf(snapshot); return this; },
        async get() {
          const docs = originals.slice(cursor + 1).filter((item) => item.exists && item.data().deleted === true).slice(0, pageSize);
          return { docs, empty: docs.length === 0 };
        },
      };
    },
  };
}

test("cleanup discovers tombstones for durable jobs and prunes only old provider-confirmed photo receipts", async () => {
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  const old = makeSnapshot("users/owner-a/catches/catch-a/photos/photo-a", {
    id: "photo-a", deleted: true, deletedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
    cloudinaryDeletedAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const fresh = makeSnapshot("users/owner-b/catches/catch-b/photos/photo-b", {
    id: "photo-b", deleted: true, deletedAt: new Date(now - 1000).toISOString(),
  });
  const recentlyConfirmed = makeSnapshot("users/owner-c/catches/catch-c/photos/photo-c", {
    id: "photo-c", deleted: true, deletedAt: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(),
    cloudinaryDeletedAt: new Date(now - 1000).toISOString(),
  });
  const confirmedDespiteFutureClientDate = makeSnapshot("users/owner-d/catches/catch-d/photos/photo-d", {
    id: "photo-d", deleted: true, deletedAt: new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString(),
    cloudinaryDeletedAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const calls = [];
  const deletionService = {
    async enqueueFromTombstones() { calls.push("discover"); return { scanned: 2, enqueued: 1, invalid: 0 }; },
    async processDueJobs() { calls.push("process"); return { scanned: 1, deleted: 0, deferred: 1, failed: 0 }; },
    async pruneCompletedJobs() { calls.push("prune-jobs"); return 0; },
  };
  const cleanup = createCloudinaryPhotoCleanup({ db: makeDb([old, fresh, recentlyConfirmed, confirmedDespiteFutureClientDate], 1), now: () => now, pageSize: 1, deletionService });
  assert.deepEqual(await cleanup(), { scanned: 3, enqueued: 1, deleted: 0, pruned: 2, failed: 0, deferred: 1 });
  assert.equal(old.exists, false);
  assert.equal(fresh.exists, true);
  assert.equal(recentlyConfirmed.exists, true);
  assert.equal(confirmedDespiteFutureClientDate.exists, false);
  assert.deepEqual(calls, ["discover", "process", "prune-jobs"]);
});
