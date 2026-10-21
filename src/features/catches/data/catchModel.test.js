import test from "node:test";
import assert from "node:assert/strict";
import { catchToForm, createCatchRecord, updateCatchFormField, validateCatchForm } from "./catchModel.js";
import { getBiggestCatch } from "../../home/utils/profileStats.js";
import { estimateFishWeight } from "./lengthWeightRelationships.js";
import { MAX_PHOTOS_PER_CATCH } from "./catchPhotos.js";

const minimalForm = {
  speciesKey: "carp", catchDate: "2026-10-16", catchTime: "12:30",
  weightKg: "", lengthCm: "", girthCm: "", fightDurationMin: "", depthM: "", waterNumber: "",
  locationName: "", gpsLocation: "", coordinates: null, bottomType: "", fishingMethod: "", baits: [], photos: [],
  conditions: { airTempC: "", waterTempC: "", pressureHpa: "", windKmh: "", moonPhase: "" },
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

test("manual weather conditions validate, persist, and round-trip without filling blank values", () => {
  const form = {
    ...minimalForm,
    coordinates: { latitude: 49.2, longitude: 16.6 },
    conditions: { airTempC: "-3,5", waterTempC: "4", pressureHpa: "1018", windKmh: "9,5", moonPhase: "waxingCrescent" },
  };
  assert.deepEqual(validateCatchForm(form), {});
  const record = createCatchRecord(form, { key: "carp", label: "Kapr" }, []);
  assert.deepEqual(record.conditions, {
    airTempC: -3.5,
    waterTempC: 4,
    pressureHpa: 1018,
    windKmh: 9.5,
    moonPhase: "waxingCrescent",
  });
  assert.deepEqual(catchToForm(record).conditions, {
    airTempC: -3.5,
    waterTempC: 4,
    pressureHpa: 1018,
    windKmh: 9.5,
    moonPhase: "waxingCrescent",
  });
  assert.deepEqual(record.conditionSources, {
    airTempC: "manual", waterTempC: "manual", pressureHpa: "manual", windKmh: "manual", moonPhase: "manual",
  });
  assert.deepEqual(catchToForm(record).conditionSources, record.conditionSources);
  assert.ok(validateCatchForm({ ...form, conditions: { ...form.conditions, windKmh: "-1" } })["Rychlost větru"]);
});

test("automatic condition provenance round-trips and legacy values default to manual", () => {
  const record = createCatchRecord({ ...minimalForm, conditions: { ...minimalForm.conditions, airTempC: 10, moonPhase: "full" }, conditionSources: { airTempC: "auto", moonPhase: "auto" } }, { key: "carp", label: "Kapr" }, []);
  assert.deepEqual(record.conditionSources, { airTempC: "auto", moonPhase: "auto" });
  assert.deepEqual(catchToForm(record).conditionSources, { airTempC: "auto", moonPhase: "auto" });

  const legacy = catchToForm({ speciesKey: "commonCarp", caughtAt: "2026-10-16T12:00:00.000Z", conditions: { airTempC: 10 } });
  assert.deepEqual(legacy.conditionSources, { airTempC: "manual" });

  const deliberatelyBlank = createCatchRecord({ ...minimalForm, conditionSources: { airTempC: "manual" } }, { key: "carp", label: "Kapr" }, []);
  assert.equal(deliberatelyBlank.conditions, null);
  assert.deepEqual(catchToForm(deliberatelyBlank).conditionSources, { airTempC: "manual" });
});

test("record has stable local-first metadata and preserves optional nulls", () => {
  const record = createCatchRecord(minimalForm, { key: "carp", label: "Kapr", latinName: "Cyprinus carpio" }, [], null);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.sync.status, "local");
  assert.equal(record.weightKg, null);
  assert.equal(record.lengthCm, null);
  assert.equal(record.species, "Kapr");
  assert.equal(record.coordinates, null);
  assert.ok(record.createdAt && record.updatedAt && record.caughtAt);
});

test("blank measurements including whitespace stay null and comma decimals stay numeric", () => {
  const record = createCatchRecord({
    ...minimalForm,
    weightKg: "   ",
    lengthCm: "",
  }, { key: "carp", label: "Kapr" }, []);
  assert.equal(record.weightKg, null);
  assert.equal(record.lengthCm, null);

  const decimal = createCatchRecord({ ...minimalForm, weightKg: "4,75" }, { key: "carp", label: "Kapr" }, []);
  assert.equal(decimal.weightKg, 4.75);

  const invalid = createCatchRecord({ ...minimalForm, lengthCm: "68 cm" }, { key: "carp", label: "Kapr" }, []);
  assert.equal(Number.isNaN(invalid.lengthCm), false);
});

test("record keeps structured coordinates and only migrates unambiguous legacy text", () => {
  const species = { key: "carp", label: "Kapr" };
  const structured = createCatchRecord({
    ...minimalForm,
    gpsLocation: "ručně popsané místo",
    coordinates: { latitude: 50.087, longitude: 14.421 },
  }, species, []);
  assert.deepEqual(structured.coordinates, { latitude: 50.087, longitude: 14.421 });
  assert.deepEqual(catchToForm(structured).coordinates, structured.coordinates);

  const migrated = createCatchRecord({ ...minimalForm, gpsLocation: "50.087, 14.421" }, species, []);
  assert.deepEqual(migrated.coordinates, { latitude: 50.087, longitude: 14.421 });
  const ambiguous = createCatchRecord({ ...minimalForm, gpsLocation: "50,087; 14,421" }, species, []);
  assert.equal(ambiguous.coordinates, null);
});

test("editing keeps the original id and creation time", () => {
  const existing = { ...createCatchRecord(minimalForm, { key: "carp", label: "Kapr" }, []), id: "fixed", createdAt: "2026-01-01T00:00:00.000Z" };
  const updated = createCatchRecord({ ...minimalForm, notes: "upraveno" }, { key: "carp", label: "Kapr" }, [], existing);
  assert.equal(updated.id, "fixed");
  assert.equal(updated.createdAt, existing.createdAt);
  assert.equal(updated.sync.revision, existing.sync.revision + 1);
  assert.equal(catchToForm(updated).notes, "upraveno");
});

test("stable water ID is retained through create and edit form round-trip", () => {
  const form = { ...minimalForm, waterId: "water-stable-id", locationName: "Původní název" };
  const record = createCatchRecord(form, { key: "carp", label: "Kapr" }, []);
  assert.equal(record.waterId, "water-stable-id");
  assert.equal(catchToForm(record).waterId, "water-stable-id");
  const edited = createCatchRecord({ ...catchToForm(record), notes: "upraveno" }, { key: "carp", label: "Kapr" }, [], record);
  assert.equal(edited.waterId, "water-stable-id");
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

test("legacy photo becomes primary, primary selection stays stable, and photo limits are enforced", () => {
  const photos = Array.from({ length: MAX_PHOTOS_PER_CATCH }, (_, index) => ({ id: `photo-${index}`, name: `fish-${index}.jpg`, type: "image/jpeg", blob: new Blob([String(index)]) }));
  const legacy = createCatchRecord({ ...minimalForm, photos: [photos[0]] }, { key: "carp", label: "Kapr" }, []);
  assert.equal(legacy.primaryPhotoId, photos[0].id);
  const selected = createCatchRecord({ ...minimalForm, photos, primaryPhotoId: photos[7].id }, { key: "carp", label: "Kapr" }, []);
  assert.equal(selected.primaryPhotoId, photos[7].id);
  const framed = createCatchRecord({ ...minimalForm, photos: [{ ...photos[0], focalX: 0.1, focalY: 0.9, zoom: 1.8 }, { ...photos[1], focalX: 0.7, focalY: 0.2, zoom: 1.2 }], primaryPhotoId: photos[1].id }, { key: "carp", label: "Kapr" }, []);
  assert.deepEqual(framed.photos.map(({ focalX, focalY, zoom }) => ({ focalX, focalY, zoom })), [
    { focalX: 0.1, focalY: 0.9, zoom: 1.8 }, { focalX: 0.7, focalY: 0.2, zoom: 1.2 },
  ]);
  assert.equal(catchToForm(framed).photos.length, 2);
  assert.throws(() => createCatchRecord({ ...minimalForm, photos: [...photos, { ...photos[0], id: "photo-over" }] }, { key: "carp", label: "Kapr" }, []), /nejvýše 10/);
});

test("missing weight is not presented as a zero kilogram record", () => {
  assert.equal(getBiggestCatch([{ weightKg: null }, { weightKg: undefined }]), null);
  assert.equal(getBiggestCatch([{ weightKg: null }, { weightKg: 2.5 }]).weightKg, 2.5);
});

test("estimated weight round-trips as an estimate while manual weight stays authoritative", () => {
  const lengthCm = 68.5;
  const estimate = estimateFishWeight("commonCarp", lengthCm);
  const estimatedForm = catchToForm({ speciesKey: "commonCarp", weightKg: null, lengthCm, caughtAt: "2026-10-19T12:00:00.000Z" });
  assert.equal(estimatedForm.weightSource, "estimated");
  assert.equal(estimatedForm.weightKg, estimate.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const manualForm = catchToForm({ speciesKey: "commonCarp", weightKg: 4.2, weightSource: "manual", lengthCm, caughtAt: "2026-10-19T12:00:00.000Z" });
  assert.equal(manualForm.weightSource, "manual");
  assert.equal(manualForm.weightKg, 4.2);
});

test("species deselection clears estimated weight but preserves a manual weight", () => {
  const estimated = { speciesKey: "commonCarp", lengthCm: "68", weightSource: "estimated", weightKg: "3,80" };
  const clearedEstimate = updateCatchFormField(estimated, "speciesKey", "");
  assert.equal(clearedEstimate.speciesKey, "");
  assert.equal(clearedEstimate.weightKg, "");
  assert.equal(clearedEstimate.weightSource, "estimated");
  assert.equal(estimated.lengthCm, "68");

  const manual = updateCatchFormField({ ...estimated, weightSource: "manual", weightKg: "4,25" }, "speciesKey", "");
  assert.equal(manual.speciesKey, "");
  assert.equal(manual.weightKg, "4,25");
  assert.equal(manual.weightSource, "manual");
});

test("estimated weights update with species and length, while manual weight is never overwritten", () => {
  const initial = { speciesKey: "commonCarp", lengthCm: "60", weightSource: "estimated", weightKg: "" };
  const initialWeight = updateCatchFormField(initial, "lengthCm", "60");
  assert.equal(initialWeight.weightKg, estimateFishWeight("commonCarp", "60").toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const changedSpecies = updateCatchFormField(initialWeight, "speciesKey", "northernPike");
  assert.equal(changedSpecies.weightKg, estimateFishWeight("northernPike", "60").toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const changedLength = updateCatchFormField(changedSpecies, "lengthCm", "70");
  assert.equal(changedLength.weightKg, estimateFishWeight("northernPike", "70").toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const manual = updateCatchFormField({ ...changedLength, weightSource: "manual", weightKg: "9,7" }, "lengthCm", "80");
  assert.equal(manual.weightKg, "9,7");
});
