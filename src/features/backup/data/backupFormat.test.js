import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalBackupDocument,
  getLocalBackupFileName,
  LOCAL_BACKUP_FORMAT,
  LOCAL_BACKUP_VERSION,
  serializeLocalBackupJson,
} from "./backupFormat.js";

const createdAt = new Date("2026-10-16T12:00:00.000Z");

test("backup contains a versioned empty local journal", async () => {
  const backup = await createLocalBackupDocument({ catches: [], trips: [], createdAt });

  assert.equal(backup.format, LOCAL_BACKUP_FORMAT);
  assert.equal(backup.formatVersion, LOCAL_BACKUP_VERSION);
  assert.equal(backup.createdAt, createdAt.toISOString());
  assert.deepEqual(backup.records, { catches: [], trips: [] });
});

test("backup preserves catch fields, trip records, and their stable relationship", async () => {
  const trip = { id: "trip-1", title: "Ranní výprava", schemaVersion: 1, startedAt: "2026-10-16T05:00:00.000Z", endedAt: null };
  const catchRecord = {
    id: "catch-1", schemaVersion: 1, speciesKey: "carp", species: "Kapr",
    caughtAt: "2026-10-16T06:00:00.000Z", weightKg: null, tripId: trip.id,
    sync: { status: "local", revision: 2 }, photos: [],
  };
  const originalCatch = structuredClone(catchRecord);
  const originalTrip = structuredClone(trip);

  const backup = await createLocalBackupDocument({ catches: [catchRecord], trips: [trip], createdAt });

  assert.deepEqual(backup.records.catches[0], catchRecord);
  assert.equal(backup.records.catches[0].tripId, backup.records.trips[0].id);
  assert.deepEqual(catchRecord, originalCatch);
  assert.deepEqual(trip, originalTrip);
});

test("condition provenance survives backup serialization and restore parsing", async () => {
  const catchRecord = {
    id: "catch-weather-source", schemaVersion: 1, speciesKey: "commonCarp", species: "Kapr obecný",
    speciesLatin: "Cyprinus carpio", weightKg: null, weightSource: "estimated", lengthCm: null, girthCm: null, fightMinutes: null,
    locationName: "", waterId: null, waterNumber: null, gpsLocation: "", coordinates: null, waterDepthM: null, bottomType: null,
    caughtAt: "2026-10-16T06:00:00.000Z", createdAt: createdAt.toISOString(), updatedAt: createdAt.toISOString(),
    conditions: { airTempC: 11, pressureHpa: 1016 },
    conditionSources: { airTempC: "auto", pressureHpa: "manual" },
    tripId: null, method: null, baits: [], result: "unspecified", notes: "", isFavorite: false,
    sync: { status: "local", revision: 1 }, photos: [],
  };
  const backup = await createLocalBackupDocument({ catches: [catchRecord], trips: [], createdAt });
  assert.deepEqual(backup.records.catches[0].conditionSources, catchRecord.conditionSources);
  const { parseLocalBackupDocument } = await import("./backupRestore.js");
  const restored = parseLocalBackupDocument(backup);
  assert.deepEqual(restored.catches[0].conditionSources, catchRecord.conditionSources);
});

test("backup encodes photo Blob bytes and leaves the source record untouched", async () => {
  const blob = new Blob(["foto"], { type: "image/jpeg" });
  const catchRecord = {
    id: "catch-photo", speciesKey: "carp", tripId: null,
    photos: [{ id: "photo-1", name: "kapr.jpg", type: "image/jpeg", caption: "Ranní výprava", blob }],
  };

  const backup = await createLocalBackupDocument({ catches: [catchRecord], trips: [], createdAt });

  assert.deepEqual(backup.records.catches[0].photos, [{
    id: "photo-1", name: "kapr.jpg", type: "image/jpeg", caption: "Ranní výprava", blobSize: 4, dataBase64: "Zm90bw==",
  }]);
  assert.equal(catchRecord.photos[0].blob, blob);
  assert.equal(catchRecord.photos[0].blob.size, 4);
});

test("backup fails instead of silently omitting an unreadable photo", async () => {
  await assert.rejects(
    createLocalBackupDocument({
      catches: [{ id: "catch-bad-photo", photos: [{ id: "photo-bad", blob: null }] }],
      trips: [],
      createdAt,
    }),
    /Fotografii u úlovku catch-bad-photo nelze bezpečně zahrnout/,
  );
});

test("backup file name uses the supplied date", () => {
  assert.equal(getLocalBackupFileName(createdAt), "chytnucz-zaloha-2026-10-16.json");
});

test("serialized backup is readable JSON with its format and records", async () => {
  const json = await serializeLocalBackupJson({
    catches: [{ id: "catch-json", species: "Kapr", photos: [] }],
    trips: [{ id: "trip-json", title: "Výprava" }],
    createdAt,
  });
  const parsed = JSON.parse(json);

  assert.equal(parsed.format, LOCAL_BACKUP_FORMAT);
  assert.equal(parsed.formatVersion, LOCAL_BACKUP_VERSION);
  assert.equal(parsed.records.catches[0].id, "catch-json");
  assert.equal(parsed.records.trips[0].id, "trip-json");
});

test("current backups include scoped privacy and progression data without changing legacy documents", async () => {
  const privacySettings = { profileVisibility: "private", scopeKey: "guest:source" };
  const progressionEvents = [{ id: "event-1", reasonKey: "catch.created:catch-1", xp: 10 }];
  const backup = await createLocalBackupDocument({
    catches: [], trips: [], privacySettings, progressionEvents, createdAt,
  });
  assert.deepEqual(backup.records.privacySettings, privacySettings);
  assert.deepEqual(backup.records.progressionEvents, progressionEvents);
  assert.deepEqual((await createLocalBackupDocument({ catches: [], trips: [], createdAt })).records, {
    catches: [], trips: [],
  });
});
