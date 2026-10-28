import assert from "node:assert/strict";
import { test } from "node:test";
import { createAccountDeletionService } from "./accountDeletion.js";

function fakeFirestore(initial = {}) {
  const rows = new Map(Object.entries(initial));
  let failDelete = false;
  const ref = (path) => ({ path, id: path.split("/").at(-1),
    async get() { return { exists: rows.has(path), data: () => rows.get(path), ref: ref(path) }; },
    async set(data) { rows.set(path, data); },
    async update(data) { rows.set(path, { ...rows.get(path), ...data }); },
    async delete() { rows.delete(path); },
    collection(name) { return collection(`${path}/${name}`); },
    async listCollections() {
      return [...new Set([...rows.keys()].filter((key) => key.startsWith(`${path}/`))
        .map((key) => key.slice(path.length + 1).split("/")[0]))].map((name) => collection(`${path}/${name}`));
    },
  });
  const collection = (path) => {
    const filters = [];
    let max = Infinity;
    let after = null;
    const query = { id: path.split("/").at(-1),
      async listDocuments() {
        return [...new Set([...rows.keys()].filter((key) => key.startsWith(`${path}/`))
          .map((key) => key.slice(path.length + 1).split("/")[0]))].sort().map((id) => ref(`${path}/${id}`));
      },
      orderBy() { return query; }, limit(value) { max = value; return query; },
      startAfter(value) { after = typeof value === "string" ? value : value.id; return query; },
      where(field, op, value) { filters.push([field, op, value]); return query; },
      async get() {
        const docs = [...rows.keys()].filter((key) => key.startsWith(`${path}/`)
          && key.slice(path.length + 1).split("/").length === 1 && (!after || key.split("/").at(-1) > after))
          .filter((key) => filters.every(([field, op, value]) => {
            const actual = rows.get(key)?.[field];
            return op === "==" ? actual === value : op === "!=" ? actual !== value
              : op === "in" ? value.includes(actual) : op === "<=" ? actual <= value : false;
          })).sort().slice(0, max).map((key) => ({ id: key.split("/").at(-1), ref: ref(key), data: () => rows.get(key) }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
    return query;
  };
  return { rows, doc: ref, collection,
    setFailDelete(value) { failDelete = value; },
    async recursiveDelete(document) {
      if (failDelete) { failDelete = false; throw new Error("temporary Firestore failure"); }
      for (const key of [...rows.keys()]) if (key === document.path || key.startsWith(`${document.path}/`)) rows.delete(key);
    },
    async runTransaction(action) {
      return action({ get: (document) => document.get(), create: (document, data) => {
        if (rows.has(document.path)) throw new Error("already exists"); rows.set(document.path, data);
      }, update: (document, data) => document.update(data) });
    },
  };
}

function fixture(extra = {}) {
  const db = fakeFirestore({
    "users/A": { id: "A" }, "users/B": { id: "B" },
    "users/A/catches/c1": { id: "c1", ownerId: "A", photoIds: ["p1"] },
    "users/A/catches/c1/photos/p1": { id: "p1", cloud: { objectKey: "users/A/catches/c1/photos/p1/original" } },
    "users/A/trips/t1": { id: "t1" }, "users/A/notifications/n1": { id: "n1" },
    "users/A/progressionEvents/e1": { id: "e1" }, "users/A/pushSubscriptions/s1": { id: "s1" },
    "users/B/catches/c2": { id: "c2", ownerId: "B" },
    ...extra,
  });
  const queued = [];
  const deleted = [];
  const auth = { async revokeRefreshTokens(uid) { assert.equal(uid, "A"); },
    async deleteUser(uid) { deleted.push(uid); } };
  const service = createAccountDeletionService({ db, auth, photoDeletion: { async enqueue(value) { queued.push(value); } },
    now: () => Date.parse("2026-10-28T12:00:00Z"), pageSize: 3 });
  return { db, queued, deleted, service };
}

async function drain(service) {
  let result;
  for (let i = 0; i < 20; i += 1) {
    result = await service.processOwner("A");
    if (["completed", "cleanup-pending", "partial-failure"].includes(result.status)) return result;
  }
  throw new Error("deletion did not settle");
}

test("deletes only owner A including nested data and queues owned photo before Auth removal", async () => {
  const { db, queued, deleted, service } = fixture();
  await service.request("A");
  const state = await drain(service);
  assert.equal(state.status, "completed");
  assert.deepEqual(queued, [{ ownerId: "A", catchId: "c1", photoId: "p1" }]);
  assert.deepEqual(deleted, ["A"]);
  assert.equal([...db.rows.keys()].some((key) => key.startsWith("users/A")), false);
  assert.deepEqual(db.rows.get("users/B/catches/c2"), { id: "c2", ownerId: "B" });
  assert.equal(db.rows.get("accountDeletions/A").status, "completed");
  await service.request("A");
  await service.processOwner("A");
  assert.deepEqual(deleted, ["A"]);
});

test("legacy catch with five photos queues every photo", async () => {
  const photos = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`users/A/catches/legacy/photos/p${n}`, { id: `p${n}` }]));
  const { queued, service } = fixture({ "users/A/catches/legacy": { id: "legacy", ownerId: "A" }, ...photos });
  await service.request("A"); await drain(service);
  assert.equal(queued.filter((item) => item.catchId === "legacy").length, 5);
});

test("orphan photo under a missing Catch parent is queued and removed", async () => {
  const { db, queued, service } = fixture({
    "users/A/catches/orphan/photos/p-orphan": { id: "p-orphan" },
  });
  await service.request("A");
  await drain(service);
  assert.deepEqual(queued.filter((item) => item.catchId === "orphan"),
    [{ ownerId: "A", catchId: "orphan", photoId: "p-orphan" }]);
  assert.equal(db.rows.has("users/A/catches/orphan/photos/p-orphan"), false);
});

test("temporary Firestore failure is retryable without deleting Auth prematurely", async () => {
  const { db, service, deleted } = fixture();
  db.setFailDelete(true);
  await service.request("A");
  let result = await service.processOwner("A");
  while (result.phase !== "data") result = await service.processOwner("A");
  assert.equal(result.status, "retry");
  assert.deepEqual(deleted, []);
  assert.equal((await drain(service)).status, "completed");
  assert.deepEqual(deleted, ["A"]);
});

test("queued cloud photo keeps account in cleanup-pending after Auth deletion", async () => {
  const { db, service, deleted } = fixture({ "users/A/photoDeletionJobs/j1": { status: "retry", photoId: "p1" } });
  await service.request("A");
  assert.equal((await drain(service)).status, "cleanup-pending");
  assert.deepEqual(deleted, ["A"]);
  assert.equal(db.rows.has("users/A/photoDeletionJobs/j1"), true);
  db.rows.set("users/A/photoDeletionJobs/j1", { status: "deleted" });
  assert.equal((await service.processOwner("A")).status, "completed");
});

test("an account without photos deletes normally", async () => {
  const { db, service, queued } = fixture({ "users/A/catches/c1": { id: "c1", ownerId: "A" } });
  db.rows.delete("users/A/catches/c1/photos/p1");
  await service.request("A");
  assert.equal((await drain(service)).status, "completed");
  assert.deepEqual(queued, []);
});

test("Auth deletion failure retries after Firestore cleanup", async () => {
  const { db, queued } = fixture();
  let calls = 0;
  const auth = { async revokeRefreshTokens() {}, async deleteUser() { calls += 1; if (calls === 1) throw new Error("temporary"); } };
  const service = createAccountDeletionService({ db, auth, photoDeletion: { async enqueue(value) { queued.push(value); } }, pageSize: 3 });
  await service.request("A");
  let result;
  for (let i = 0; i < 10; i += 1) {
    result = await service.processOwner("A");
    if (calls === 1) break;
  }
  assert.equal(result.status, "retry");
  assert.equal(result.phase, "auth");
  assert.equal((await service.processOwner("A")).status, "completed");
  assert.equal(calls, 2);
});

test("permanent photo failure remains visible and a completed receipt expires before 30 days", async () => {
  let current = Date.parse("2026-10-28T12:00:00Z");
  const { db, queued } = fixture({ "users/A/photoDeletionJobs/j1": { status: "permanent-failure" } });
  const auth = { async revokeRefreshTokens() {}, async deleteUser() {} };
  const service = createAccountDeletionService({ db, auth, photoDeletion: { async enqueue(value) { queued.push(value); } },
    now: () => current, pageSize: 3 });
  await service.request("A");
  assert.equal((await drain(service)).status, "partial-failure");
  assert.equal(db.rows.get("accountDeletions/A").lastErrorCode, "photo_cleanup_needs_attention");
  db.rows.set("users/A/photoDeletionJobs/j1", { status: "deleted" });
  assert.equal((await service.processOwner("A")).status, "completed");
  current += 29 * 24 * 60 * 60 * 1000 + 1;
  assert.equal(await service.pruneCompleted(), 1);
  assert.equal(db.rows.has("accountDeletions/A"), false);
});

test("account marker expires after Auth removal even when photo job is still retrying", async () => {
  let current = Date.parse("2026-10-28T12:00:00Z");
  const { db, queued } = fixture({ "users/A/photoDeletionJobs/j1": { status: "retry" } });
  const service = createAccountDeletionService({ db,
    auth: { async revokeRefreshTokens() {}, async deleteUser() {} },
    photoDeletion: { async enqueue(value) { queued.push(value); } }, now: () => current, pageSize: 3 });
  await service.request("A");
  assert.equal((await drain(service)).status, "cleanup-pending");
  current += 29 * 24 * 60 * 60 * 1000 + 1;
  assert.equal(await service.pruneCompleted(), 1);
  assert.equal(db.rows.has("accountDeletions/A"), false);
  assert.equal(db.rows.has("users/A/photoDeletionJobs/j1"), true);
});
