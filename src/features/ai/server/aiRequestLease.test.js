import test from "node:test";
import assert from "node:assert/strict";
import { createAiRequestLease } from "./aiRequestLease.js";
function database() {
  const data = new Map(); let queue = Promise.resolve();
  return { data, doc: path => ({ path }), runTransaction(fn) {
    const next = queue.then(() => fn({ get: async ({ path }) => ({ exists: data.has(path), data: () => data.get(path) }),
      set: ({ path }, row) => data.set(path, row) })); queue = next.catch(() => {}); return next;
  } };
}
test("separate Vercel instances share one lease, retain crashes and fence stale finish tickets", async () => {
  const db = database(), key = "a".repeat(64); let time = 1000;
  const first = createAiRequestLease({ db, now: () => time }), second = createAiRequestLease({ db, now: () => time });
  const results = await Promise.allSettled([first.claim("owner", key, { consentRevision: 1 }), second.claim("owner", key, { consentRevision: 1 })]);
  assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
  assert.equal(results.find(value => value.status === "rejected").reason.aiCode, "request_in_progress");
  time += 120001;
  const replacement = await second.claim("owner", key, { consentRevision: 1 });
  await first.finish("owner", key, results[0].value);
  await assert.rejects(first.claim("owner", key, { consentRevision: 1 }), error => error.aiCode === "request_in_progress");
  await second.finish("owner", key, replacement, { code: "provider_quota", retryAt: "2026-11-09T00:00:00Z" });
  await assert.rejects(first.claim("owner", key, { consentRevision: 1 }), error => error.retryAt === "2026-11-09T00:00:00.000Z");
});
test("a completed result appearing after the initial cache read prevents a second dispatch", async () => {
  const db = database(), key = "b".repeat(64), lease = createAiRequestLease({ db, now: () => 1000 });
  const ticket = await lease.claim("owner", key, { consentRevision: 2 });
  db.data.set(`users/owner/aiResults/${key}`, { ownerId: "owner", consentRevision: 2, result: {} });
  await lease.finish("owner", key, ticket);
  await assert.rejects(lease.claim("owner", key, { consentRevision: 2 }), error => error.aiCode === "request_in_progress");
  assert.ok(await lease.claim("other", key, { consentRevision: 2 }));
});

test("account deletion fences both claiming and finishing leases without recreating user data", async () => {
  const db = database(), key = "c".repeat(64), lease = createAiRequestLease({ db, now: () => 1000 });
  const ticket = await lease.claim("owner", key, { consentRevision: 1 });
  db.data.set("accountDeletions/owner", { state: "deleting" });
  db.data.delete(`users/owner/aiResults/lease-${key}`);
  await lease.finish("owner", key, ticket);
  assert.equal(db.data.has(`users/owner/aiResults/lease-${key}`), false);
  await assert.rejects(lease.claim("owner", key, { consentRevision: 1 }), error => error.aiCode === "account_unavailable");
});
