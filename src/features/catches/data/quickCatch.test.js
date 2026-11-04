import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { catchRepository, getActiveGuestScopeKey, outboxRepository, openLocalDatabase, PHOTO_BINARY_STORE_NAME } from "./catchRepository.js";
import { createQuickCapture, prepareQuickCatch, persistQuickCatch, isIncompleteQuickCatch } from "./quickCatch.js";
import { sha256Blob } from "./photoCloudProvider.js";
import { catchToForm, createCatchRecord, validateCatchForm } from "./catchModel.js";
import { getCatchRecognition } from "./catchDetail.js";
import { filterAndSortCatches } from "../utils/catchJournal.js";
import { deleteLocalScopeData } from "../../settings/data/localDataDeletion.js";

const capturedAt = new Date("2026-11-04T12:00:42.000Z");
const blob = new Blob([new Uint8Array([255, 216, 1, 2, 255, 217])], { type: "image/jpeg" });
const prepare = async () => ({ blob, type: blob.type, size: blob.size, sha256: await sha256Blob(blob) });
const readMetadata = async () => null;
const scope = async () => ({ scopeKey: await getActiveGuestScopeKey(), ownerId: null });
const fresh = async (options = {}) => prepareQuickCatch(blob, createQuickCapture("camera", capturedAt), { prepare, readMetadata, ...options });

test("one photo saves one ordinary catch and one existing outbox operation; retry preserves identity", async () => {
  const owner = await scope();
  const record = await fresh();
  await persistQuickCatch(record, owner, catchRepository);
  await persistQuickCatch(record, owner, catchRepository);
  assert.equal((await catchRepository.list(owner)).filter(item => item.id === record.id).length, 1);
  assert.equal((await outboxRepository.list()).filter(item => item.entityId === record.id).length, 1);
  const restored = await catchRepository.get(record.id, owner);
  assert.equal(await restored.photos[0].blob.text(), await blob.text());
  assert.equal(restored.caughtAt, capturedAt.toISOString());
  assert.equal(restored.lengthCm, null); assert.equal(restored.weightKg, null); assert.equal(restored.speciesKey, "");
  assert.equal(restored.quickCatch.inputSource, "camera");
  assert.equal(isIncompleteQuickCatch(restored), true);
  assert.equal(getCatchRecognition(restored, [restored], capturedAt).personalBest, false);
});

test("readback verifies actual durable bytes and rejects a missing stored photo", async () => {
  const owner = await scope(); const record = await fresh();
  await persistQuickCatch(record, owner, catchRepository);
  const db = await openLocalDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_BINARY_STORE_NAME, "readwrite");
    tx.objectStore(PHOTO_BINARY_STORE_NAME).delete(JSON.stringify([owner.scopeKey, record.id, record.photos[0].id]));
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  }); db.close();
  await assert.rejects(catchRepository.verifyDurablePhoto(record.id, record.photos[0].id, record.photos[0].contentSha256, owner), /bezpečně uložit/);
  await persistQuickCatch(record, owner, catchRepository);
  assert.equal(await catchRepository.verifyDurablePhoto(record.id, record.photos[0].id, record.photos[0].contentSha256, owner), true);
});

test("success waits for durable verification; rejected storage or readback never resolves success", async () => {
  const record = await fresh(); const owner = await scope();
  let release; let finished = false;
  const saving = persistQuickCatch(record, owner, { getMetadata: async () => null, put: async value => value,
    verifyDurablePhoto: () => new Promise(resolve => { release = resolve; }) }).then(() => { finished = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(finished, false); release(true); await saving; assert.equal(finished, true);
  for (const name of ["QuotaExceededError", "InvalidStateError"]) {
    await assert.rejects(persistQuickCatch(await fresh(), owner, { getMetadata: async () => null,
      put: async () => { throw Object.assign(new Error(name), { name }); } }), { name });
  }
});

test("scope deletion invalidates in-flight capture at the database transaction boundary", async () => {
  const owner = await scope();
  const generation = await catchRepository.getQuickCaptureGeneration(owner);
  const record = await fresh();
  await deleteLocalScopeData(owner, { removeItem() {} });
  await assert.rejects(catchRepository.put(record, { ...owner, quickCaptureGeneration: generation }), /zrušeno/);
  assert.equal(await catchRepository.getMetadata(record.id, owner), undefined);
  assert.ok((await catchRepository.getQuickCaptureGeneration(owner)) !== generation);
});

test("retry never recreates a catch deleted after an earlier successful write", async () => {
  const record = await fresh(); const owner = await scope(); let writes = 0;
  const repository = { getMetadata: async () => undefined, put: async value => { writes++; return value; },
    verifyDurablePhoto: async () => { throw new Error("readback interrupted"); } };
  await assert.rejects(persistQuickCatch(record, owner, repository), /interrupted/);
  await assert.rejects(persistQuickCatch(record, owner, repository), /smazán/);
  assert.equal(writes, 1);
});

test("invalid photo fails before creating a record; image processing failure propagates", async () => {
  await assert.rejects(prepareQuickCatch(new Blob(), createQuickCapture()), /platnou/);
  await assert.rejects(fresh({ prepare: async () => { throw new Error("bad decoder"); } }), /bad decoder/);
});

test("offline capture never calls a network service and remains readable after reopening", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline: network forbidden"); };
  try {
    const owner = await scope(); const record = await fresh();
    await persistQuickCatch(record, owner, catchRepository);
    const reopened = await catchRepository.get(record.id, owner);
    assert.equal(reopened.photos[0].blob.size, blob.size);
    assert.equal(reopened.verification.status, "unverified");
  } finally { globalThis.fetch = previousFetch; }
});

test("historical gallery photo uses EXIF and excludes today's active trip", async () => {
  const capture = createQuickCapture("gallery", capturedAt);
  const record = await prepareQuickCatch(blob, capture, { prepare, readMetadata: async () => ({ capturedAt: "2025-01-01T09:12:00Z" }),
    trip: { id: "today", startedAt: capturedAt.toISOString(), locationName: "Today" } });
  assert.equal(record.caughtAt, "2025-01-01T09:12:00.000Z");
  assert.equal(record.tripId, null); assert.equal(record.quickCatch.provenance.caughtAt, "exif");
});

test("quick catch edits allow unknown species and retain missing measurements", async () => {
  const record = await fresh(); const form = catchToForm(record);
  assert.deepEqual(validateCatchForm(form, { allowUnknownSpecies: true }), {});
  assert.ok(validateCatchForm(form).species);
  const edited = createCatchRecord({ ...form, notes: "U vody" }, { key: "", label: record.species }, [], record);
  assert.equal(edited.id, record.id); assert.equal(edited.lengthCm, null); assert.equal(edited.weightKg, null);
  assert.equal(edited.captureMode, "quick");
});

test("atomic enrichment loses to manual revision and cannot resurrect deleted record", async () => {
  const owner = await scope(); const record = await fresh();
  await persistQuickCatch(record, owner, catchRepository);
  const revision = (await catchRepository.getMetadata(record.id, owner)).sync.revision;
  await catchRepository.put({ ...record, speciesKey: "northernPike", species: "Štika obecná", sync: { revision: revision + 1 } }, owner);
  assert.equal(await catchRepository.patchQuickCatchEnrichment(record.id, revision, { values: { caughtAt: "2025-01-01T00:00:00Z" }, provenance: { caughtAt: "exif" } }, owner), null);
  assert.equal((await catchRepository.get(record.id, owner)).speciesKey, "northernPike");
  await catchRepository.delete(record.id, owner);
  assert.equal(await catchRepository.patchQuickCatchEnrichment(record.id, revision + 1, {}, owner), null);
  assert.equal(await catchRepository.getMetadata(record.id, owner), undefined);
});

test("enrichment merges latest photo state without replacing binary data; incomplete Journal filter", async () => {
  const owner = await scope(); const record = await fresh();
  await persistQuickCatch(record, owner, catchRepository);
  const latest = await catchRepository.getMetadata(record.id, owner);
  const updated = await catchRepository.patchQuickCatchEnrichment(record.id, latest.sync.revision,
    { jobs: { metadata: { status: "unavailable", attempts: 1, nextAttemptAt: null } } }, owner);
  assert.equal(updated.sync.revision, latest.sync.revision + 1);
  assert.equal(await catchRepository.verifyDurablePhoto(record.id, record.photos[0].id, record.photos[0].contentSha256, owner), true);
  assert.equal(filterAndSortCatches([record, { ...record, id: "complete", speciesKey: "carp", lengthCm: 40 }], { incompleteOnly: true }).length, 1);
});
