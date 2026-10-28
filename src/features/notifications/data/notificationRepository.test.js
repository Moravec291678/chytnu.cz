import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationRepository } from "./notificationRepository.js";

function makeRemote() {
  const records = new Map();
  return {
    records,
    async list(ownerId) { return [...records.values()].filter((item) => item.ownerId === ownerId).map((item) => structuredClone(item)); },
    async get(ownerId, id) { const item = records.get(id); return item?.ownerId === ownerId ? structuredClone(item) : null; },
    async create(record) {
      if (records.has(record.id)) throw new Error("already exists");
      records.set(record.id, structuredClone(record));
    },
    async markRead(ownerId, id, readAt) {
      const item = records.get(id);
      if (!item || item.ownerId !== ownerId) throw new Error("not found");
      records.set(id, { ...item, readAt });
    },
  };
}

function input(id, createdAt, overrides = {}) {
  return {
    id, type: "challenge", title: `Výzva ${id}`, body: "Výzva byla dokončena.",
    createdAt, deepLink: "/challenges", ...overrides,
  };
}

test("guest inbox sorts newest first, marks individual/all read, and scopes records", async () => {
  const repository = createNotificationRepository({ remote: makeRemote() });
  const firstScope = { scopeKey: "guest:notice-repository-a", ownerId: null };
  const otherScope = { scopeKey: "guest:notice-repository-b", ownerId: null };
  await repository.create(input("guest-old", "2026-10-27T10:00:00.000Z"), firstScope);
  await repository.create(input("guest-new", "2026-10-28T10:00:00.000Z"), firstScope);
  await repository.create(input("other-profile", "2026-10-29T10:00:00.000Z"), otherScope);
  assert.deepEqual((await repository.list(firstScope)).map((item) => item.id), ["guest-new", "guest-old"]);
  const marked = await repository.markRead("guest-new", firstScope, { now: new Date("2026-10-28T11:00:00.000Z") });
  assert.equal(marked.readAt, "2026-10-28T11:00:00.000Z");
  await repository.markAllAsRead(firstScope, { now: new Date("2026-10-28T12:00:00.000Z") });
  assert.ok((await repository.list(firstScope)).every((item) => item.readAt));
  assert.equal((await repository.list(otherScope)).length, 1);
  await assert.rejects(repository.markRead("other-profile", firstScope), /nepatří aktivnímu profilu/);
});

test("account notifications sync owner-scoped, retain reads, and retry after offline writes", async () => {
  const remote = makeRemote();
  const scope = { scopeKey: "account:notification-owner", ownerId: "notification-owner" };
  const repository = createNotificationRepository({ remote });
  const created = await repository.create(input("account-notice", "2026-10-28T10:00:00.000Z"), scope);
  assert.equal(created.remoteSyncStatus, "synced");
  assert.equal(remote.records.get(created.id).ownerId, scope.ownerId);

  await repository.markRead(created.id, scope, { now: new Date("2026-10-28T11:00:00.000Z") });
  assert.equal(remote.records.get(created.id).readAt, "2026-10-28T11:00:00.000Z");

  await remote.create({ ...input("remote-only", "2026-10-28T12:00:00.000Z"), ownerId: scope.ownerId });
  const listed = await repository.list(scope);
  assert.deepEqual(listed.map((item) => item.id), ["remote-only", "account-notice"]);
  assert.equal(listed[0].scopeKey, scope.scopeKey);

  let online = false;
  const intermittent = {
    async list(ownerId) { if (!online) throw new Error("offline"); return remote.list(ownerId); },
    async get(ownerId, id) { if (!online) throw new Error("offline"); return remote.get(ownerId, id); },
    async create(record) { if (!online) throw new Error("offline"); return remote.create(record); },
    async markRead(...args) { if (!online) throw new Error("offline"); return remote.markRead(...args); },
  };
  const offlineRepository = createNotificationRepository({ remote: intermittent });
  const offlineRecord = await offlineRepository.create(input("offline-notice", "2026-10-28T13:00:00.000Z"), scope);
  assert.equal(offlineRecord.remoteSyncStatus, "pending");
  online = true;
  await offlineRepository.list(scope);
  assert.equal(remote.records.get("offline-notice").id, "offline-notice");
});

test("duplicate event IDs do not duplicate an inbox entry or erase its read state", async () => {
  const repository = createNotificationRepository({ remote: null });
  const scope = { scopeKey: "guest:notification-idempotency", ownerId: null };
  await repository.create(input("same-event", "2026-10-28T10:00:00.000Z"), scope);
  await repository.markRead("same-event", scope, { now: new Date("2026-10-28T11:00:00.000Z") });
  await repository.create(input("same-event", "2026-10-28T12:00:00.000Z", { title: "Duplicitní událost" }), scope);
  const notifications = await repository.list(scope);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].readAt, "2026-10-28T11:00:00.000Z");
  assert.equal(notifications[0].title, "Výzva same-event");
});
