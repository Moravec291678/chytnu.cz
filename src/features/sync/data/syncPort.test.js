import test from "node:test";
import assert from "node:assert/strict";
import { createInMemorySyncAdapter } from "./inMemorySyncAdapter.js";
import { createSyncPort, SyncPortError } from "./syncPort.js";
import { createLocalRepositoryAdapter } from "./localRepositoryAdapter.js";

function makeRecord(id, fields = {}) {
  return { id, species: "Kapr", weightKg: null, tripId: null, sync: { status: "local", revision: 1 }, ...fields };
}

function remoteContractTests(name, makePort) {
  test(`${name}: catch and trip writes preserve IDs, null fields, revisions, and owner scope`, async () => {
    const port = makePort();
    for (const entityType of ["catch", "trip"]) {
      const record = makeRecord(`${entityType}-1`, entityType === "catch" ? { tripId: "trip-9", weightKg: null } : { title: "Ranní výprava" });
      const saved = await port.write({ ownerId: "angler-a", entityType, record, expectedRevision: null, operationId: `op-${entityType}-1`, localRevision: 1 });
      assert.equal(saved.entityId, record.id);
      assert.equal(saved.revision, 1);
      const read = await port.read({ ownerId: "angler-a", entityType, entityId: record.id });
      assert.deepEqual(read.record, record);
      assert.equal(read.revision, 1);
      const listed = await port.list({ ownerId: "angler-a", entityType });
      assert.equal(listed.items.length, 1);
      assert.equal(listed.items[0].record.id, record.id);
    }

    assert.equal(await port.read({ ownerId: "angler-b", entityType: "catch", entityId: "catch-1" }), null);
  });

  test(`${name}: stale revisions and unknown records return stable errors`, async () => {
    const port = makePort();
    await port.write({ ownerId: "angler-a", entityType: "catch", record: makeRecord("c-1"), expectedRevision: null, operationId: "create-c1", localRevision: 1 });
    await assert.rejects(
      port.write({ ownerId: "angler-a", entityType: "catch", record: makeRecord("c-1", { notes: "jinak" }), expectedRevision: null, operationId: "stale-c1", localRevision: 1 }),
      (error) => error.code === "conflict",
    );
    await assert.rejects(
      port.delete({ ownerId: "angler-a", entityType: "trip", entityId: "missing", expectedRevision: 1, operationId: "del-missing", localRevision: 1 }),
      (error) => error.code === "not_found",
    );
  });

  test(`${name}: delete appears in the owner's delta, without leaking another owner's changes`, async () => {
    const port = makePort();
    const saved = await port.write({ ownerId: "angler-a", entityType: "catch", record: makeRecord("c-delete"), expectedRevision: null, operationId: "create-delete", localRevision: 1 });
    await port.write({ ownerId: "angler-b", entityType: "trip", record: makeRecord("t-private"), expectedRevision: null, operationId: "create-private", localRevision: 1 });
    await port.delete({ ownerId: "angler-a", entityType: "catch", entityId: "c-delete", expectedRevision: saved.revision, operationId: "delete-c", localRevision: 1 });
    const delta = await port.delta({ ownerId: "angler-a", cursor: saved.cursor });
    assert.equal(delta.items.length, 1);
    assert.equal(delta.items[0].kind, "delete");
    assert.equal(delta.items[0].entityId, "c-delete");
  });
}

remoteContractTests("in-memory adapter", () => createSyncPort(createInMemorySyncAdapter()));

test("sync port validates IDs, account scope, revisions, and adapter operations", () => {
  assert.throws(() => createSyncPort({}), (error) => error.code === "invalid_request");
  const port = createSyncPort(createInMemorySyncAdapter());
  assert.throws(() => port.read({ ownerId: "", entityType: "catch", entityId: "c" }), (error) => error.code === "invalid_request");
  assert.throws(() => port.write({ ownerId: "a", entityType: "catch", record: makeRecord("c"), expectedRevision: -1, operationId: "op" }), (error) => error.code === "invalid_request");
  assert.ok(new SyncPortError("unavailable", "offline").retryable);
});

test("a stale offline upsert cannot recreate a remotely deleted record", async () => {
  const port = createSyncPort(createInMemorySyncAdapter());
  const saved = await port.write({ ownerId: "angler-a", entityType: "catch", record: makeRecord("catch-delete"), expectedRevision: null, operationId: "create", localRevision: 1 });
  await port.delete({ ownerId: "angler-a", entityType: "catch", entityId: "catch-delete", expectedRevision: saved.revision, operationId: "delete", localRevision: 2 });
  await assert.rejects(
    port.write({ ownerId: "angler-a", entityType: "catch", record: makeRecord("catch-delete"), expectedRevision: saved.revision, operationId: "stale-device-upsert", localRevision: 1 }),
    (error) => error.code === "conflict",
  );
  assert.equal((await port.read({ ownerId: "angler-a", entityType: "catch", entityId: "catch-delete" })).deleted, true);
});

test("local repository adapter delegates CRUD without assigning account ownership", async () => {
  const data = { catch: new Map(), trip: new Map() };
  const repositories = Object.fromEntries(Object.entries(data).map(([type, store]) => [type, {
    async get(id) { return store.get(id); },
    async put(record) { store.set(record.id, record); return record; },
    async delete(id) { store.delete(id); return id; },
    async list() { return [...store.values()]; },
  }]));
  const local = createLocalRepositoryAdapter(repositories);
  const record = makeRecord("local-catch", { tripId: null, weightKg: null });
  await local.write("catch", record);
  assert.deepEqual(await local.read("catch", record.id), record);
  assert.deepEqual(await local.list("catch"), [record]);
  assert.equal(await local.delete("catch", record.id), record.id);
  assert.equal(await local.read("catch", record.id), null);
  assert.equal(Object.hasOwn(record, "ownerId"), false);
});
