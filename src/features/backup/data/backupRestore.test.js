import test from "node:test";
import assert from "node:assert/strict";
import { LOCAL_BACKUP_FORMAT, LOCAL_BACKUP_VERSION } from "./backupFormat.js";
import { createLocalBackupDocument } from "./backupFormat.js";
import {
  parseLocalBackupJson,
  parseLocalBackupDocument,
  recordsAreEqual,
  restoreLocalBackup,
  summarizeLocalBackupRestore,
} from "./backupRestore.js";

const time = "2026-10-16T12:00:00.000Z";
const guestOptions = { scopeKey: "guest:test-backup", ownerId: null };

function makeTrip(id = "trip-1") {
  return {
    schemaVersion: 1, id, title: "Ranní výprava", locationName: "Labe", methodKey: null,
    createdAt: time, updatedAt: time, startedAt: time, endedAt: "2026-10-16T15:00:00.000Z",
    scopeKey: guestOptions.scopeKey, sync: { status: "local", revision: 1 },
  };
}

function makeCatch(id = "catch-1", tripId = "trip-1") {
  return {
    schemaVersion: 1, id, createdAt: time, updatedAt: time, caughtAt: time,
    species: "Kapr obecný", speciesKey: "commonCarp", speciesLatin: "Cyprinus carpio",
    weightKg: null, lengthCm: 72, girthCm: null, fightMinutes: null, locationName: "Labe",
    waterNumber: null, gpsLocation: "", coordinates: null, waterDepthM: null, bottomType: null, tripId,
    method: null, baits: [{ key: "corn", label: "Kukuřice", isCustom: false }], result: "released",
    photos: [], notes: "Ranní záběr", isFavorite: false, scopeKey: guestOptions.scopeKey,
    sync: { status: "local", revision: 1 },
  };
}

function makeDocument({ catches = [makeCatch()], trips = [makeTrip()], privacySettings, progressionEvents } = {}) {
  const records = { catches, trips };
  if (privacySettings !== undefined) records.privacySettings = privacySettings;
  if (progressionEvents !== undefined) records.progressionEvents = progressionEvents;
  return { format: LOCAL_BACKUP_FORMAT, formatVersion: LOCAL_BACKUP_VERSION, createdAt: time, records };
}

function makeBackup(document = makeDocument()) {
  return parseLocalBackupDocument(document);
}

function makeDatabase(initial = { catches: [], trips: [] }, { failWrites = false } = {}) {
  const initialStores = { catches: [], trips: [], outbox: [], privacySettings: [], progressionEvents: [], ...initial };
  const keyFor = (store, row) => store === "outbox" ? row.sequence : store === "privacySettings" ? row.scopeKey : row.id;
  const committed = Object.fromEntries(Object.entries(initialStores).map(([store, rows]) => [store, new Map(rows.map((row) => [keyFor(store, row), structuredClone(row)]))]));
  let nextSequence = 0;
  const db = {
    close() {},
    transaction(storeNames) {
      const working = Object.fromEntries(storeNames.map((store) => [store, new Map([...committed[store]].map(([id, row]) => [id, structuredClone(row)]))]));
      const transaction = {
        error: null,
        aborted: false,
        objectStore(name) {
          const scheduleWrite = (operation) => {
            const request = {};
            queueMicrotask(() => {
              if (transaction.aborted) return;
              if (failWrites) {
                transaction.abort();
                return;
              }
              operation();
              request.result = true;
              request.onsuccess?.();
            });
            return request;
          };
          return {
            getAll() {
              const request = {};
              queueMicrotask(() => {
                if (!transaction.aborted) {
                  request.result = [...working[name].values()].map((row) => structuredClone(row));
                  request.onsuccess?.();
                }
              });
              return request;
            },
            index(indexName) {
              return {
                get(value) {
                  const request = {};
                  queueMicrotask(() => {
                    if (transaction.aborted) return;
                    request.result = [...working[name].values()].find((row) => row[indexName] === value);
                    request.onsuccess?.();
                  });
                  return request;
                },
              };
            },
            clear() { return scheduleWrite(() => working[name].clear()); },
            put(row) { return scheduleWrite(() => {
              if (name === "outbox" && row.sequence === undefined) row.sequence = ++nextSequence;
              working[name].set(keyFor(name, row), structuredClone(row));
            }); },
            add(row) { return scheduleWrite(() => {
              if (name === "outbox" && row.sequence === undefined) row.sequence = ++nextSequence;
              working[name].set(keyFor(name, row), structuredClone(row));
            }); },
            delete(id) { return scheduleWrite(() => working[name].delete(id)); },
          };
        },
        abort() {
          if (transaction.aborted) return;
          transaction.aborted = true;
          setTimeout(() => transaction.onabort?.(), 0);
        },
      };
      setTimeout(() => {
        if (transaction.aborted) return;
        for (const name of storeNames) committed[name] = working[name];
        transaction.oncomplete?.();
      }, 0);
      return transaction;
    },
    snapshot() {
      return Object.fromEntries(Object.entries(committed).map(([name, rows]) => [name, [...rows.values()].map((row) => structuredClone(row))]));
    },
  };
  return db;
}

test("empty and related catch/trip backups validate and retain nullable measurements", () => {
  assert.deepEqual(makeBackup(makeDocument({ catches: [], trips: [] })).catches, []);
  const backup = makeBackup();
  assert.equal(backup.catches[0].tripId, backup.trips[0].id);
  assert.equal(backup.catches[0].weightKg, null);
});

test("backup accepts bounded structured coordinates and rejects malformed values", () => {
  const valid = makeBackup(makeDocument({ catches: [{
    ...makeCatch(),
    coordinates: { latitude: 50.087, longitude: 14.421 },
  }] }));
  assert.deepEqual(valid.catches[0].coordinates, { latitude: 50.087, longitude: 14.421 });
  assert.throws(() => makeBackup(makeDocument({ catches: [{
    ...makeCatch(), coordinates: { latitude: 91, longitude: 14.421 },
  }] })), /neplatné souřadnice/);
  assert.throws(() => makeBackup(makeDocument({ catches: [{
    ...makeCatch(), coordinates: { latitude: 50, longitude: 14, precision: "exact" },
  }] })), /neplatné souřadnice/);
});

test("a backup exported after cloud sync restores as safe ownerless local data", () => {
  const syncedTrip = { ...makeTrip(), ownerId: "remote-owner", sync: { status: "metadata-synced", revision: 4, serverRevision: 7 } };
  const syncedCatch = { ...makeCatch(), ownerId: "remote-owner", sync: { status: "metadata-synced", revision: 5, serverRevision: 9, photoStatus: "none" } };
  const backup = parseLocalBackupDocument(makeDocument({ catches: [syncedCatch], trips: [syncedTrip] }));
  assert.equal(backup.catches[0].ownerId, null);
  assert.deepEqual(backup.catches[0].sync, { status: "local", revision: 5, photoStatus: "none" });
  assert.equal(backup.trips[0].ownerId, null);
  assert.deepEqual(backup.trips[0].sync, { status: "local", revision: 4 });
});

test("multiple catches and trips retain their IDs and exact trip links after restore", async () => {
  const secondTrip = makeTrip("trip-2");
  const secondCatch = makeCatch("catch-2", "trip-2");
  const backup = makeBackup(makeDocument({ catches: [makeCatch(), secondCatch], trips: [makeTrip(), secondTrip] }));
  const db = makeDatabase();

  await restoreLocalBackup(backup, "merge", guestOptions, async () => db);

  const stored = db.snapshot();
  assert.deepEqual(stored.catches.map((record) => [record.id, record.tripId]), [["catch-1", "trip-1"], ["catch-2", "trip-2"]]);
  assert.deepEqual(stored.trips.map((record) => record.id), ["trip-1", "trip-2"]);
  assert.deepEqual(stored.outbox.map((operation) => operation.entityType), ["trip", "trip", "catch", "catch"]);
  assert.ok(stored.outbox.every((operation) => operation.operation === "upsert"));
});

test("privacy and immutable progression events restore transactionally into the selected guest scope", async () => {
  const privacySettings = {
    profileVisibility: "private", defaultCatchVisibility: "private", defaultPhotoVisibility: "private",
    defaultLocationPrecision: "none", privateSpotDefault: true, nearbyOptIn: false, heatmapOptIn: false,
  };
  const progressionEvents = [{
    id: "guest:old|catch.created:catch-1", scopeKey: "guest:old", ownerId: null,
    type: "catch.created", reasonKey: "catch.created:catch-1", xp: 10,
    sourceEntityType: "catch", sourceEntityId: "catch-1", definitionVersion: 1,
    periodKey: null, occurredAt: time, createdAt: time, sync: { status: "local", revision: 1 },
  }];
  const backup = makeBackup(makeDocument({ privacySettings, progressionEvents }));
  const db = makeDatabase();

  await restoreLocalBackup(backup, "replace", guestOptions, async () => db);

  const snapshot = db.snapshot();
  assert.equal(snapshot.privacySettings[0].scopeKey, guestOptions.scopeKey);
  assert.equal(snapshot.progressionEvents[0].id, `${guestOptions.scopeKey}|catch.created:catch-1`);
  assert.equal(snapshot.progressionEvents[0].xp, 10);
});

test("invalid JSON, unsupported versions, duplicate IDs, and missing trip links are rejected", () => {
  assert.throws(() => parseLocalBackupJson("{"), /platný JSON/);
  assert.throws(() => makeBackup({ ...makeDocument(), formatVersion: 2 }), /není podporována/);
  assert.throws(() => makeBackup(makeDocument({ catches: [makeCatch(), makeCatch()], trips: [makeTrip()] })), /duplicitní ID úlovků/);
  assert.throws(() => makeBackup(makeDocument({ catches: [makeCatch("catch-1", "missing")], trips: [makeTrip()] })), /odkazuje na výpravu/);
});

test("photo bytes are decoded and size, type, or base64 corruption is rejected", async () => {
  const photoData = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCioAAAAASUVORK5CYII=";
  const photoSize = atob(photoData).length;
  const photo = { id: "photo-1", name: "kapr.png", type: "image/png", blobSize: photoSize, dataBase64: photoData };
  const backup = makeBackup(makeDocument({ catches: [{ ...makeCatch(), photos: [photo] }] }));
  assert.equal(await backup.catches[0].photos[0].blob.size, photoSize);
  assert.equal(backup.catches[0].photos[0].blob.type, "image/png");
  assert.deepEqual(
    new Uint8Array(await backup.catches[0].photos[0].blob.arrayBuffer()),
    Uint8Array.from(atob(photoData), (character) => character.charCodeAt(0)),
  );
  const modifiedBytes = Uint8Array.from(atob(photoData), (character) => character.charCodeAt(0));
  modifiedBytes[12] ^= 1;
  const modifiedBase64 = btoa(Array.from(modifiedBytes, (byte) => String.fromCharCode(byte)).join(""));
  const modifiedBackup = makeBackup(makeDocument({ catches: [{ ...makeCatch(), photos: [{ ...photo, dataBase64: modifiedBase64 }] }] }));
  assert.equal(await recordsAreEqual(backup.catches[0], modifiedBackup.catches[0]), false);
  assert.throws(() => makeBackup(makeDocument({ catches: [{ ...makeCatch(), photos: [{ ...photo, blobSize: 5 }] }] })), /neodpovídá/);
  assert.throws(() => makeBackup(makeDocument({ catches: [{ ...makeCatch(), photos: [{ ...photo, dataBase64: "%%%=" }] }] })), /dekódovat/);
  assert.throws(() => makeBackup(makeDocument({ catches: [{ ...makeCatch(), photos: [{ ...photo, type: "image/jpeg" }] }] })), /neodpovídá deklarovanému typu/);
});

test("same IDs with equal or different content are summarized separately", async () => {
  const backup = makeBackup();
  const exact = makeBackup();
  const summary = await summarizeLocalBackupRestore(backup, { catches: exact.catches, trips: exact.trips });
  assert.equal(summary.unchangedCount, 2);
  assert.equal(summary.conflictCount, 0);
  const changed = makeBackup(makeDocument({ catches: [{ ...makeCatch(), notes: "jiné" }], trips: [makeTrip()] }));
  const conflict = await summarizeLocalBackupRestore(changed, { catches: exact.catches, trips: exact.trips });
  assert.equal(conflict.conflictCount, 1);
  assert.equal(await recordsAreEqual(backup.catches[0], exact.catches[0]), true);
});

test("a freshly exported local catch with a photo can be merged back idempotently", async () => {
  const photoData = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCioAAAAASUVORK5CYII=";
  const blob = new Blob([Uint8Array.from(atob(photoData), (character) => character.charCodeAt(0))], { type: "image/png" });
  const sourceCatch = {
    ...makeCatch(),
    ownerId: null,
    photos: [{ id: "photo-roundtrip", name: "kapr.png", type: "image/png", blob }],
    sync: { status: "local", revision: 2, photoStatus: "local-only" },
  };
  const sourceTrip = { ...makeTrip(), ownerId: null };
  const parsed = parseLocalBackupDocument(await createLocalBackupDocument({
    catches: [sourceCatch], trips: [sourceTrip], createdAt: new Date(time),
  }));

  const summary = await summarizeLocalBackupRestore(parsed, { catches: [sourceCatch], trips: [sourceTrip] });
  assert.equal(summary.unchangedCount, 2);
  assert.equal(summary.conflictCount, 0);

  const db = makeDatabase({ catches: [sourceCatch], trips: [sourceTrip] });
  const result = await restoreLocalBackup(parsed, "merge", guestOptions, async () => db);
  assert.equal(result.skipped, 2);
  assert.equal(result.catches, 0);
  assert.equal(result.trips, 0);
});

test("merge is idempotent and a different same-ID record aborts before writing", async () => {
  const db = makeDatabase();
  const backup = makeBackup();
  await restoreLocalBackup(backup, "merge", guestOptions, async () => db);
  await restoreLocalBackup(backup, "merge", guestOptions, async () => db);
  assert.equal(db.snapshot().catches.length, 1);
  assert.equal(db.snapshot().trips.length, 1);

  const before = db.snapshot();
  const changed = makeBackup(makeDocument({ catches: [{ ...makeCatch(), notes: "konflikt" }], trips: [makeTrip()] }));
  await assert.rejects(restoreLocalBackup(changed, "merge", guestOptions, async () => db), /Sloučení zastaveno/);
  assert.deepEqual(db.snapshot(), before);
});

test("replacing with an empty backup removes only local data and never schedules cloud deletion", async () => {
  const oldCatch = makeCatch("old-catch", null);
  oldCatch.tripId = null;
  const db = makeDatabase({ catches: [oldCatch], trips: [makeTrip("old-trip")] });

  await restoreLocalBackup(makeBackup(makeDocument({ catches: [], trips: [] })), "replace", guestOptions, async () => db);

  const snapshot = db.snapshot();
  assert.deepEqual(snapshot.catches, []);
  assert.deepEqual(snapshot.trips, []);
  assert.deepEqual(snapshot.outbox, []);
});

test("preview and invalid validation do not modify the local stores", async () => {
  const oldCatch = makeCatch("old-catch", null);
  oldCatch.tripId = null;
  const db = makeDatabase({ catches: [oldCatch], trips: [] });
  const before = db.snapshot();
  const current = { catches: before.catches, trips: before.trips };
  await summarizeLocalBackupRestore(makeBackup(), current);
  assert.throws(() => parseLocalBackupDocument(makeDocument({ catches: [makeCatch("bad-link", "missing")], trips: [] })), /odkazuje na výpravu/);
  assert.deepEqual(db.snapshot(), before);
});

test("replace writes catches and trips together; a database failure preserves both original stores", async () => {
  const oldCatch = makeCatch("old-catch", null);
  oldCatch.tripId = null;
  const oldTrip = makeTrip("old-trip");
  const db = makeDatabase({ catches: [oldCatch], trips: [oldTrip] });
  const failingDb = makeDatabase({ catches: [oldCatch], trips: [oldTrip] }, { failWrites: true });
  await assert.rejects(restoreLocalBackup(makeBackup(), "replace", guestOptions, async () => failingDb), /přerušena|nepodařilo/);
  assert.deepEqual(failingDb.snapshot(), {
    catches: [oldCatch], trips: [oldTrip], outbox: [], privacySettings: [], progressionEvents: [],
  });
  assert.equal(db.snapshot().catches[0].id, "old-catch");
  await restoreLocalBackup(makeBackup(), "replace", guestOptions, async () => db);
  assert.deepEqual(db.snapshot().catches.map((row) => row.id), ["catch-1"]);
  assert.deepEqual(db.snapshot().trips.map((row) => row.id), ["trip-1"]);
});
