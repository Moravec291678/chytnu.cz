import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { createWaterRecord } from "../../waters/data/waterModel.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { toRemoteRecord } from "./firestoreSyncAdapter.js";
import { createSyncPort } from "./syncPort.js";

test("Water uses the shared sync contract and remote projection contains no photo bytes", async () => {
  const scope = { scopeKey: "account:water-test", ownerId: "water-test" };
  const water = createWaterRecord({ id: "water-sync-1", name: "Labe", type: "Řeka" }, scope);
  await waterRepository.put(water, scope);
  const projected = toRemoteRecord("water", water, "water-test");
  assert.equal(projected.id, "water-sync-1");
  assert.equal(projected.entityType, undefined);
  assert.equal(projected.name, "Labe");
  assert.equal(projected.type, "Řeka");
  assert.equal("blob" in projected, false);
  const port = createSyncPort({
    async read() { return null; }, async write(args) { return args; }, async delete(args) { return args; },
    async list() { return { items: [], cursor: null }; }, async delta() { return { changes: [], cursor: null }; },
  });
  const result = await port.write({ ownerId: "water-test", entityType: "water", record: water, expectedRevision: null, operationId: "water-op", localRevision: 1 });
  assert.equal(result.entityType, "water");
});
