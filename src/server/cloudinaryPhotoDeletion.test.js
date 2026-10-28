import assert from "node:assert/strict";
import test from "node:test";
import { createCloudinaryPhotoDeletionService, PHOTO_DELETE_DELAY_MS, PHOTO_DELETE_RECEIPT_PRUNE_MS } from "./cloudinaryPhotoDeletion.js";

class FakeTimestamp {
  constructor(value) { this.value = value; }
  toMillis() { return this.value; }
  static fromMillis(value) { return new FakeTimestamp(value); }
}

function createFakeDb(initial = []) {
  const docs = new Map(initial.map(([path, data]) => [path, { ...data }]));
  let transactionTail = Promise.resolve();
  function ref(path) {
    return {
      path,
      async get() {
        const data = docs.get(path);
        return { exists: Boolean(data), data: () => data && ({ ...data }), ref: this };
      },
      async update(fields) {
        const data = docs.get(path);
        if (!data) throw new Error("missing doc");
        Object.assign(data, fields);
      },
      async delete() { docs.delete(path); },
    };
  }
  function queryFor(collectionName) {
    const filters = [];
    let max = 100;
    let after = "";
    const query = {
      where(field, operator, value) { filters.push({ field, operator, value }); return query; },
      limit(count) { max = count; return query; },
      startAfter(snapshot) { after = snapshot.ref.path; return query; },
      async get() {
        const docsPage = [...docs.entries()]
          .filter(([path, data]) => path.split("/").at(-2) === collectionName && path > after
            && filters.every((filter) => filter.operator === "==" ? data[filter.field] === filter.value
              : filter.operator === "in" ? filter.value.includes(data[filter.field])
              : filter.operator === "<=" && typeof filter.value?.toMillis === "function"
                && typeof data[filter.field]?.toMillis === "function" && data[filter.field].toMillis() <= filter.value.toMillis()))
          .sort(([left], [right]) => left.localeCompare(right))
          .slice(0, max)
          .map(([path, data]) => ({ ref: ref(path), exists: true, data: () => ({ ...data }) }));
        return { docs: docsPage, empty: docsPage.length === 0 };
      },
    };
    return query;
  }
  return {
    docs,
    doc: ref,
    collectionGroup: queryFor,
    async runTransaction(operation) {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await operation({
        async get(documentRef) { return documentRef.get(); },
        create(documentRef, data) {
          if (docs.has(documentRef.path)) throw new Error("already exists");
          docs.set(documentRef.path, { ...data });
        },
        set(documentRef, data) { docs.set(documentRef.path, { ...data }); },
        update(documentRef, fields) { return documentRef.update(fields); },
      }); } finally { release(); }
    },
  };
}

const ownerId = "owner-a";
const catchId = "catch-a";
const photoId = "photo-a";
const publicId = `chytnucz/users/${ownerId}/catches/${catchId}/photos/${photoId}/original`;
const derivePublicId = (owner, catchKey, photoKey) => `chytnucz/users/${owner}/catches/${catchKey}/photos/${photoKey}/original`;

test("one-hour eligibility reaches the first daily sweep within about 25 hours", () => {
  const day = 24 * 60 * 60 * 1000;
  for (const minute of [0, 1, 30, 59, 60, 600, 1380, 1439]) {
    const requestedAt = minute * 60 * 1000;
    const eligibleAt = requestedAt + PHOTO_DELETE_DELAY_MS;
    const firstSweep = Math.ceil(eligibleAt / day) * day;
    assert.ok(firstSweep - requestedAt <= day + PHOTO_DELETE_DELAY_MS);
  }
});

test("one cleanup run continues past the first page of due photos", async () => {
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  const db = createFakeDb();
  const destroyed = [];
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    pageSize: 2, getCloudinary: async () => ({ uploader: { async destroy(id) {
      destroyed.push(id);
      return { result: "ok" };
    } } }), derivePublicId });
  for (let index = 0; index < 5; index += 1) {
    await service.enqueue({ ownerId, catchId, photoId: `photo-${index}` });
  }
  now += PHOTO_DELETE_DELAY_MS;
  const result = await service.processDueJobs();
  assert.equal(result.scanned, 5);
  assert.equal(result.deleted, 5);
  assert.equal(destroyed.length, 5);
});

test("server deletion job is owner-scoped, deterministic, and eligible for the first safe sweep", async () => {
  const db = createFakeDb();
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() { return { result: "ok" }; } } }), derivePublicId });
  const first = await service.enqueue({ ownerId, catchId, photoId });
  const duplicate = await service.enqueue({ ownerId, catchId, photoId });
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(first.jobId, duplicate.jobId);
  const job = db.docs.get(`users/${ownerId}/photoDeletionJobs/${first.jobId}`);
  assert.deepEqual(Object.keys(job).sort(), ["attempts", "catchId", "cloudinaryPublicId", "completedAt", "deleteAfter", "lastAttemptAt", "leaseUntil", "nextAttemptAt", "ownerId", "photoId", "requestedAt", "status"].sort());
  assert.equal(job.cloudinaryPublicId, publicId);
  assert.equal(job.requestedAt.toMillis(), now);
  assert.equal(job.deleteAfter.toMillis(), now + PHOTO_DELETE_DELAY_MS);
  assert.equal(PHOTO_DELETE_DELAY_MS, 60 * 60 * 1000);
  assert.equal(job.status, "pending");
  assert.equal(job.attempts, 0);
  assert.equal(Object.keys(job).some((key) => /blob|bytes|notes|gps|token|secret/i.test(key)), false);
  assert.equal(job.lastAttemptAt, null);
  assert.deepEqual(await service.processDueJobs(), { scanned: 0, deleted: 0, deferred: 0, failed: 0 });
  now += PHOTO_DELETE_DELAY_MS;
  let destroyed = null;
  const dueService = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy(...args) {
      assert.equal(job.status, "deleting");
      destroyed = args;
      return { result: "ok" };
    } } }), derivePublicId });
  assert.deepEqual(await dueService.processDueJobs(), { scanned: 1, deleted: 1, deferred: 0, failed: 0 });
  assert.deepEqual(destroyed, [publicId, { resource_type: "image", type: "authenticated" }]);
  assert.equal(job.status, "deleted");
  assert.equal(job.attempts, 1);
  assert.equal(job.lastAttemptAt.toMillis(), now);
});

test("failed Cloudinary deletion keeps the job and schedules a bounded retry", async () => {
  const db = createFakeDb();
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() { return { result: "error" }; } } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  now += PHOTO_DELETE_DELAY_MS;
  const result = await service.processDueJobs();
  const job = db.docs.get(`users/${ownerId}/photoDeletionJobs/${jobId}`);
  assert.deepEqual(result, { scanned: 1, deleted: 0, deferred: 0, failed: 1 });
  assert.equal(job.status, "retry");
  assert.equal(job.attempts, 1);
  assert.equal(job.lastErrorCode, "cloudinary_delete_failed");
  assert.equal(job.nextAttemptAt.toMillis(), now + 5 * 60 * 1000);
  now += 5 * 60 * 1000;
  const retryService = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() { return { result: "not found" }; } } }), derivePublicId });
  assert.equal((await retryService.processDueJobs()).deleted, 1);
  assert.equal(job.status, "deleted");
  assert.equal(job.attempts, 2);
});

test("a deleted Catch's photo tombstones queue every cloud asset without immediate destruction", async () => {
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  const db = createFakeDb([photoId, "photo-b"].map((id) => [`users/${ownerId}/catches/${catchId}/photos/${id}`, {
    id, deleted: true, deletedAt: "2026-10-28T11:00:00.000Z", cloud: { state: "synced" },
  }]));
  const destroyed = [];
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp,
    now: () => now, getCloudinary: async () => ({ uploader: { destroy: async (id) => { destroyed.push(id); return { result: "ok" }; } } }), derivePublicId });
  assert.deepEqual(await service.enqueueFromTombstones(), { scanned: 2, enqueued: 2, invalid: 0 });
  const jobs = [...db.docs.entries()].filter(([path]) => path.includes("/photoDeletionJobs/"));
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every(([, job]) => job.ownerId === ownerId && job.status === "pending"));
  assert.deepEqual(await service.processDueJobs(), { scanned: 0, deleted: 0, deferred: 0, failed: 0 });
  assert.deepEqual(destroyed, []);
  now += PHOTO_DELETE_DELAY_MS;
  assert.equal((await service.processDueJobs()).deleted, 2);
  assert.deepEqual(new Set(destroyed), new Set([publicId, derivePublicId(ownerId, catchId, "photo-b")]));
});

test("Catch deletion queues and cleans every asset for one-photo and four-photo catches", async () => {
  for (const count of [1, 4]) {
    let now = Date.parse("2026-10-28T12:00:00.000Z");
    const ids = Array.from({ length: count }, (_, index) => `photo-${index + 1}`);
    const db = createFakeDb(ids.map((id) => [`users/${ownerId}/catches/${catchId}/photos/${id}`, {
      id, deleted: true, deletedAt: new Date(now).toISOString(),
    }]));
    const destroyed = [];
    const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp,
      now: () => now, pageSize: 2, derivePublicId,
      getCloudinary: async () => ({ uploader: { async destroy(id) { destroyed.push(id); return { result: "ok" }; } } }),
    });
    assert.equal((await service.enqueueFromTombstones()).enqueued, count);
    assert.equal((await service.processDueJobs()).deleted, 0);
    now += PHOTO_DELETE_DELAY_MS;
    let deleted = 0;
    for (let batch = 0; batch < Math.ceil(count / 2); batch += 1) deleted += (await service.processDueJobs()).deleted;
    assert.equal(deleted, count);
    assert.deepEqual(new Set(destroyed), new Set(ids.map((id) => derivePublicId(ownerId, catchId, id))));
    assert.equal((await service.processDueJobs()).scanned, 0);
  }
});

test("cleanup does not process a job just before 24 hours but does process it when due", async () => {
  const db = createFakeDb();
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  let destroys = 0;
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() { destroys += 1; return { result: "ok" }; } } }), derivePublicId });
  await service.enqueue({ ownerId, catchId, photoId });
  now += PHOTO_DELETE_DELAY_MS - 1;
  assert.equal((await service.processDueJobs()).scanned, 0);
  assert.equal(destroys, 0);
  now += 2;
  assert.equal((await service.processDueJobs()).deleted, 1);
  assert.equal(destroys, 1);
});

test("removing one photo queues only that photo and preserves the other Catch photo", async () => {
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  const removedPath = `users/${ownerId}/catches/${catchId}/photos/${photoId}`;
  const retainedPath = `users/${ownerId}/catches/${catchId}/photos/photo-b`;
  const db = createFakeDb([
    [removedPath, { id: photoId, deleted: true, deletedAt: new Date(now).toISOString() }],
    [retainedPath, { id: "photo-b", deleted: false, deletedAt: null }],
  ]);
  const destroyed = [];
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy(id) { destroyed.push(id); return { result: "ok" }; } } }), derivePublicId });
  assert.deepEqual(await service.enqueueFromTombstones(), { scanned: 1, enqueued: 1, invalid: 0 });
  assert.equal([...db.docs.keys()].filter((path) => path.includes("/photoDeletionJobs/")).length, 1);
  assert.equal(db.docs.get(retainedPath).deleted, false);
  assert.equal((await service.processDueJobs()).deleted, 0);
  now += PHOTO_DELETE_DELAY_MS;
  assert.equal((await service.processDueJobs()).deleted, 1);
  assert.deepEqual(destroyed, [publicId]);
  assert.equal(db.docs.get(retainedPath).deleted, false);
  assert.equal(db.docs.get(removedPath).cloudinaryDeletedAt !== undefined, true);
});

test("job processing refuses a stored Cloudinary public ID that does not match its owner and photo identity", async () => {
  const db = createFakeDb();
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() { throw new Error("must not call provider"); } } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  const job = db.docs.get(`users/${ownerId}/photoDeletionJobs/${jobId}`);
  job.deleteAfter = FakeTimestamp.fromMillis(now - 1);
  job.nextAttemptAt = FakeTimestamp.fromMillis(now - 1);
  job.cloudinaryPublicId = "someone-elses-asset";
  assert.deepEqual(await service.processDueJobs(), { scanned: 1, deleted: 0, deferred: 0, failed: 1 });
  assert.equal(job.attempts, 0);
  assert.equal(job.status, "permanent-failure");
});

test("active photo reference blocks destruction and records blocked-reference state", async () => {
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  const photoPath = `users/${ownerId}/catches/${catchId}/photos/${photoId}`;
  const db = createFakeDb([[photoPath, { id: photoId, deleted: false }]]);
  let destroyed = false;
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() { destroyed = true; } } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  const job = db.docs.get(`users/${ownerId}/photoDeletionJobs/${jobId}`);
  job.deleteAfter = FakeTimestamp.fromMillis(now - 1);
  job.nextAttemptAt = FakeTimestamp.fromMillis(now - 1);
  assert.deepEqual(await service.processDueJobs(), { scanned: 1, deleted: 0, deferred: 0, failed: 1 });
  assert.equal(job.status, "blocked-reference");
  assert.equal(destroyed, false);
});

test("active Catch reference blocks destruction even when photo metadata is tombstoned", async () => {
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  const db = createFakeDb([
    [`users/${ownerId}/catches/${catchId}`, { id: catchId, ownerId, deleted: false, photoRefs: { [photoId]: true } }],
    [`users/${ownerId}/catches/${catchId}/photos/${photoId}`, { id: photoId, deleted: true, deletedAt: new Date(now).toISOString() }],
  ]);
  let destroyed = false;
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() { destroyed = true; return { result: "ok" }; } } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  const job = db.docs.get(`users/${ownerId}/photoDeletionJobs/${jobId}`);
  job.deleteAfter = FakeTimestamp.fromMillis(now - 1);
  job.nextAttemptAt = FakeTimestamp.fromMillis(now - 1);
  assert.equal((await service.processDueJobs()).failed, 1);
  assert.equal(job.status, "blocked-reference");
  assert.equal(destroyed, false);
});

test("worker refuses an owner-mismatched photo cloud link before Cloudinary delete", async () => {
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  const db = createFakeDb([[`users/${ownerId}/catches/${catchId}/photos/${photoId}`, {
    id: photoId, deleted: true,
    cloud: { provider: "cloudinary", objectKey: `users/owner-b/catches/${catchId}/photos/${photoId}/original` },
  }]]);
  let destroyed = false;
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() { destroyed = true; } } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  const job = db.docs.get(`users/${ownerId}/photoDeletionJobs/${jobId}`);
  job.deleteAfter = FakeTimestamp.fromMillis(now - 1);
  job.nextAttemptAt = FakeTimestamp.fromMillis(now - 1);
  assert.equal((await service.processDueJobs()).failed, 1);
  assert.equal(job.status, "permanent-failure");
  assert.equal(destroyed, false);
});

test("two devices enqueue the same deletion and receive one stable job", async () => {
  const db = createFakeDb();
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp,
    now: () => Date.parse("2026-10-28T12:00:00.000Z"),
    getCloudinary: async () => ({ uploader: { destroy: async () => ({ result: "ok" }) } }), derivePublicId });
  const [first, second] = await Promise.all([
    service.enqueue({ ownerId, catchId, photoId }),
    service.enqueue({ ownerId, catchId, photoId }),
  ]);
  assert.equal(first.jobId, second.jobId);
  assert.deepEqual([first.created, second.created].sort(), [false, true]);
  assert.equal([...db.docs.keys()].filter((path) => path.includes("/photoDeletionJobs/")).length, 1);
});

test("two concurrent cleanup runs claim one job and destroy its asset once", async () => {
  const db = createFakeDb();
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  let releaseDestroy;
  let notifyDestroy;
  const enteredDestroy = new Promise((resolve) => { notifyDestroy = resolve; });
  const waitForDestroy = new Promise((resolve) => { releaseDestroy = resolve; });
  let destroys = 0;
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() {
      destroys += 1;
      notifyDestroy();
      await waitForDestroy;
      return { result: "ok" };
    } } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  now += PHOTO_DELETE_DELAY_MS;
  const first = service.processDueJobs();
  await enteredDestroy;
  const second = await service.processDueJobs();
  assert.equal(second.deleted, 0);
  assert.equal(second.scanned, 0, "the active lease removes the job from the due query");
  releaseDestroy();
  assert.equal((await first).deleted, 1);
  assert.equal((await service.processDueJobs()).scanned, 0);
  assert.equal(db.docs.get(`users/${ownerId}/photoDeletionJobs/${jobId}`).status, "deleted");
  assert.equal(destroys, 1);
});

test("already missing Cloudinary asset confirms deletion without another retry", async () => {
  const db = createFakeDb();
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  const photoPath = `users/${ownerId}/catches/${catchId}/photos/${photoId}`;
  db.docs.set(photoPath, { id: photoId, deleted: true, name: "private-file.jpg", size: 123,
    focalX: 0.5, deletedAt: "2026-10-27T12:00:00.000Z" });
  let destroys = 0;
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() { destroys += 1; return { result: "not found" }; } } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  now += PHOTO_DELETE_DELAY_MS;
  assert.equal((await service.processDueJobs()).deleted, 1);
  assert.equal(db.docs.get(`users/${ownerId}/photoDeletionJobs/${jobId}`).status, "deleted");
  assert.equal(typeof db.docs.get(photoPath).cloudinaryDeletedAt, "string");
  assert.deepEqual(Object.keys(db.docs.get(photoPath)).sort(), ["cloudinaryDeletedAt", "deleted", "deletedAt", "id"]);
  assert.equal((await service.processDueJobs()).scanned, 0);
  assert.equal(destroys, 1);
});

test("Cloudinary 404 rejection also completes cleanup without retry", async () => {
  const db = createFakeDb();
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() {
      throw Object.assign(new Error("missing asset"), { http_code: 404 });
    } } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  now += PHOTO_DELETE_DELAY_MS;
  assert.equal((await service.processDueJobs()).deleted, 1);
  const job = db.docs.get(`users/${ownerId}/photoDeletionJobs/${jobId}`);
  assert.equal(job.status, "deleted");
  assert.equal(job.attempts, 1);
  assert.equal(job.nextAttemptAt, null);
  assert.equal((await service.processDueJobs()).scanned, 0);
});

test("transient provider failures use bounded exponential backoff without polling before due", async () => {
  const db = createFakeDb();
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  let calls = 0;
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { async destroy() {
      calls += 1;
      throw Object.assign(new Error("temporary provider error"), { http_code: 503 });
    } } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  now += PHOTO_DELETE_DELAY_MS;
  const job = db.docs.get(`users/${ownerId}/photoDeletionJobs/${jobId}`);
  for (const expectedDelay of [5, 10, 20, 40, 80, 160, 320, 640, 720]) {
    assert.equal((await service.processDueJobs()).failed, 1);
    assert.equal(job.status, "retry");
    assert.equal(job.nextAttemptAt.toMillis(), now + expectedDelay * 60 * 1000);
    assert.equal((await service.processDueJobs()).scanned, 0);
    now += expectedDelay * 60 * 1000;
  }
  assert.equal(calls, 9);
  assert.equal(job.attempts, 9);
});

test("completed photo deletion receipts expire from server confirmation time while unfinished work remains", async () => {
  const db = createFakeDb();
  let now = Date.parse("2026-10-28T12:00:00.000Z");
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp, now: () => now,
    getCloudinary: async () => ({ uploader: { destroy: async () => ({ result: "ok" }) } }), derivePublicId });
  const { jobId } = await service.enqueue({ ownerId, catchId, photoId });
  const active = await service.enqueue({ ownerId, catchId, photoId: "photo-pending" });
  const path = `users/${ownerId}/photoDeletionJobs/${jobId}`;
  const activePath = `users/${ownerId}/photoDeletionJobs/${active.jobId}`;
  now += 40 * 24 * 60 * 60 * 1000;
  const completed = db.docs.get(path);
  completed.status = "deleted";
  completed.completedAt = FakeTimestamp.fromMillis(now);
  assert.equal(await service.pruneCompletedJobs(), 0, "old request time must not shorten receipt retention");
  now += PHOTO_DELETE_RECEIPT_PRUNE_MS;
  assert.equal(await service.pruneCompletedJobs(), 1);
  assert.equal(db.docs.has(path), false);
  assert.equal(db.docs.has(activePath), true, "unfinished deletion must not be discarded as a receipt");
});

test("confirmed photo tombstone does not recreate an expired job", async () => {
  const photoPath = `users/${ownerId}/catches/${catchId}/photos/${photoId}`;
  const db = createFakeDb([[photoPath, { id: photoId, deleted: true,
    deletedAt: "2026-10-01T00:00:00.000Z", cloudinaryDeletedAt: "2026-10-28T12:00:00.000Z" }]]);
  const service = createCloudinaryPhotoDeletionService({ db, Timestamp: FakeTimestamp,
    now: () => Date.parse("2026-10-29T12:00:00.000Z"),
    getCloudinary: async () => ({ uploader: { destroy: async () => ({ result: "ok" }) } }), derivePublicId });
  assert.deepEqual(await service.enqueueFromTombstones(), { scanned: 1, enqueued: 0, invalid: 0 });
  assert.equal([...db.docs.keys()].some((path) => path.includes("/photoDeletionJobs/")), false);
});
