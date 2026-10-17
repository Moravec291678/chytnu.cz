import test from "node:test";
import assert from "node:assert/strict";
import { catchToForm, createCatchRecord, validateCatchForm } from "./catchModel.js";
import { getBiggestCatch } from "../../home/utils/profileStats.js";

const minimalForm = {
  speciesKey: "carp", catchDate: "2026-10-16", catchTime: "12:30",
  weightKg: "", lengthCm: "", girthCm: "", fightDurationMin: "", depthM: "", waterNumber: "",
  locationName: "", gpsLocation: "", bottomType: "", fishingMethod: "", baits: [], photos: [],
  notes: "", isFavorite: false, resultKey: "released",
};

test("minimal catch may omit measurements and validates species and date", () => {
  assert.deepEqual(validateCatchForm(minimalForm), {});
  assert.equal(validateCatchForm({ ...minimalForm, speciesKey: "" }).species, "Vyber druh ryby.");
  assert.ok(validateCatchForm({ ...minimalForm, catchDate: "not-a-date" }).catchDate);
});

test("accepts decimal comma and rejects invalid or out-of-range measurements", () => {
  assert.deepEqual(validateCatchForm({ ...minimalForm, weightKg: "4,75", depthM: "2.5" }), {});
  assert.ok(validateCatchForm({ ...minimalForm, weightKg: "4,75kg" }).Váha);
  assert.ok(validateCatchForm({ ...minimalForm, lengthCm: "-1" }).Délka);
  assert.ok(validateCatchForm({ ...minimalForm, weightKg: "1001" }).Váha);
});

test("record has stable local-first metadata and preserves optional nulls", () => {
  const record = createCatchRecord(minimalForm, { key: "carp", label: "Kapr", latinName: "Cyprinus carpio" }, [], null);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.sync.status, "local");
  assert.equal(record.weightKg, null);
  assert.equal(record.lengthCm, null);
  assert.equal(record.species, "Kapr");
  assert.ok(record.createdAt && record.updatedAt && record.caughtAt);
});

test("editing keeps the original id and creation time", () => {
  const existing = { ...createCatchRecord(minimalForm, { key: "carp", label: "Kapr" }, []), id: "fixed", createdAt: "2026-01-01T00:00:00.000Z" };
  const updated = createCatchRecord({ ...minimalForm, notes: "upraveno" }, { key: "carp", label: "Kapr" }, [], existing);
  assert.equal(updated.id, "fixed");
  assert.equal(updated.createdAt, existing.createdAt);
  assert.equal(updated.sync.revision, existing.sync.revision + 1);
  assert.equal(catchToForm(updated).notes, "upraveno");
});

test("editing preserves forward-compatible fields, custom choices, and remote photo metadata", () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  const existing = {
    ...createCatchRecord(minimalForm, { key: "carp", label: "Kapr" }, []),
    id: "forward-compatible", ownerId: "angler-a", conditions: { source: "provider", pressureHpa: 1012 },
    method: { key: "my-method", label: "Moje metoda", isCustom: true },
    baits: [{ key: "my-bait", label: "Tajná směs", isCustom: true }],
    photos: [{ id: "photo", name: "fish.jpg", type: "image/jpeg", blob, storagePath: "private/path", sha256: "a".repeat(64), size: 3, photoStatus: "synced" }],
  };
  const form = catchToForm(existing);
  form.photos = [{ ...existing.photos[0], previewUrl: "blob:preview" }];
  const updated = createCatchRecord(form, { key: "carp", label: "Kapr" }, [], existing, []);
  assert.deepEqual(updated.conditions, existing.conditions);
  assert.equal(updated.ownerId, "angler-a");
  assert.deepEqual(updated.method, existing.method);
  assert.deepEqual(updated.baits, existing.baits);
  assert.equal(updated.photos[0].storagePath, "private/path");
  assert.equal(updated.photos[0].sha256, "a".repeat(64));
  assert.equal(updated.photos[0].previewUrl, undefined);
  assert.equal(updated.photos[0].blob, blob);
});

test("missing weight is not presented as a zero kilogram record", () => {
  assert.equal(getBiggestCatch([{ weightKg: null }, { weightKg: undefined }]), null);
  assert.equal(getBiggestCatch([{ weightKg: null }, { weightKg: 2.5 }]).weightKg, 2.5);
});
