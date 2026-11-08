import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { tripRepository } from "./tripRepository.js";
const scope = { scopeKey: "account:trip-cas-owner", ownerId: "trip-cas-owner" };

test("stale Trip form cannot overwrite a newer local or second-device revision or resurrect a missing Trip", async () => {
  const original = await tripRepository.put({ id: "trip-cas", title: "Původní", waterDepthM: 3, sync: { revision: 1, serverRevision: 1 } }, scope);
  await tripRepository.put({ ...original, waterDepthM: 1, sync: { ...original.sync, revision: original.sync.revision + 1, serverRevision: 2 } }, scope);
  const stale = { ...scope, expectedRevision: original.sync.revision, expectedServerRevision: original.sync.serverRevision };
  await assert.rejects(tripRepository.put({ ...original, title: "Starý formulář" }, stale), { code: "trip_revision_conflict" });
  assert.equal((await tripRepository.get(original.id, scope)).waterDepthM, 1);
  const current = await tripRepository.get(original.id, scope);
  await tripRepository.put({ ...current, title: "Aktuální formulář" }, { ...scope, expectedRevision: current.sync.revision, expectedServerRevision: current.sync.serverRevision });
  await assert.rejects(tripRepository.put({ id: "deleted-trip-cas", title: "Nesmí vzniknout" }, stale), { code: "trip_revision_conflict" });
  assert.equal(await tripRepository.get("deleted-trip-cas", scope), undefined);
});
