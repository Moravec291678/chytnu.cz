import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocationCollections,
  buildSeasonCollections,
  buildSpeciesAlbum,
  buildTrophyRecords,
  getSpeciesAlbumYear,
} from "./speciesAlbum.js";

const catalog = [{ key: "carp", label: "Kapr" }, { key: "pike", label: "Štika" }];

test("album derives empty and discovered species from the catch journal", () => {
  const empty = buildSpeciesAlbum([], catalog);
  assert.deepEqual(empty.map((item) => [item.discovered, item.catchCount]), [[false, 0], [false, 0]]);

  const album = buildSpeciesAlbum([{ speciesKey: "carp", caughtAt: "2026-01-02T00:00:00.000Z", weightKg: null, lengthCm: 50 }], catalog);
  assert.equal(album[0].discovered, true);
  assert.equal(album[0].bestWeightKg, null);
  assert.equal(album[0].bestWeightCatch, null);
  assert.equal(album[0].bestLengthCm, 50);
  assert.equal(album[1].discovered, false);
});

test("duplicate species aggregate count, personal records, and first and last catch", () => {
  const album = buildSpeciesAlbum([
    { speciesKey: "carp", caughtAt: "2026-03-01T00:00:00.000Z", weightKg: 3, lengthCm: 60 },
    { speciesKey: "carp", caughtAt: "2026-01-01T00:00:00.000Z", weightKg: 5, lengthCm: null },
    { speciesKey: "pike", caughtAt: "2026-02-01T00:00:00.000Z", weightKg: 2, lengthCm: 70 },
  ], catalog);
  assert.deepEqual(album.map((item) => item.catchCount), [2, 1]);
  assert.equal(album[0].bestWeightKg, 5);
  assert.equal(album[0].bestWeightCatch.weightKg, 5);
  assert.equal(album[0].bestLengthCm, 60);
  assert.equal(album[0].firstCaughtAt, "2026-01-01T00:00:00.000Z");
  assert.equal(album[0].lastCaughtAt, "2026-03-01T00:00:00.000Z");
});

test("album changes deterministically after species edit, delete, restore, or remote replacement", () => {
  const source = [{ id: "one", speciesKey: "carp", caughtAt: "2026-01-01T00:00:00.000Z" }];
  assert.equal(buildSpeciesAlbum(source, catalog)[0].catchCount, 1);
  assert.equal(buildSpeciesAlbum([{ ...source[0], speciesKey: "pike" }], catalog)[1].catchCount, 1);
  assert.equal(buildSpeciesAlbum([], catalog)[0].catchCount, 0);
  assert.deepEqual(buildSpeciesAlbum(structuredClone(source), catalog), buildSpeciesAlbum(source, catalog));
});

test("persistent shared mastery can keep a species discovered without inventing remaining Catch history", () => {
  const album = buildSpeciesAlbum([], catalog, [{ speciesKey: "carp", level: 3, stars: 3 }]);
  assert.equal(album[0].discovered, true);
  assert.equal(album[0].catchCount, 0);
  assert.equal(album[0].stars, 3);
  assert.equal(album[1].discovered, false);
  assert.equal(album[1].stars, 0);
});

test("location collections group actual catches and trips without inventing named waters", () => {
  const locations = buildLocationCollections(
    [
      { locationName: "Řeka", caughtAt: "2026-03-01T12:00:00.000Z" },
      { locationName: " reka ", caughtAt: "2026-03-02T12:00:00.000Z" },
      { locationName: "Jezero" },
      { locationName: "" },
    ],
    [
      { locationName: "REKA", startedAt: "2026-03-03T12:00:00.000Z" },
      { locationName: "Kanál", startedAt: "2026-03-04T12:00:00.000Z" },
    ],
  );

  assert.deepEqual(locations.map(({ name, catchCount, tripCount }) => [name, catchCount, tripCount]), [
    ["Kanál", 0, 1],
    ["Řeka", 2, 1],
    ["Jezero", 1, 0],
  ]);
});

test("season collections use local record dates and only include the requested year", () => {
  const seasons = buildSeasonCollections(
    [
      { caughtAt: "2026-06-15T12:00:00.000Z" },
      { caughtAt: "2026-06-16T12:00:00.000Z" },
      { caughtAt: "2025-06-15T12:00:00.000Z" },
      { caughtAt: "not-a-date" },
    ],
    [
      { startedAt: "2026-10-15T12:00:00.000Z" },
      { startedAt: "2026-10-16T12:00:00.000Z" },
      { startedAt: "not-a-date" },
    ],
    2026,
  );

  assert.deepEqual(seasons.map(({ key, catchCount, tripCount }) => [key, catchCount, tripCount]), [
    ["autumn", 0, 2],
    ["summer", 2, 0],
  ]);
});

test("season collection boundaries use Europe/Prague local calendar dates", () => {
  const catches = [
    { caughtAt: "2025-12-31T23:30:00.000Z" },
    { caughtAt: "2026-12-31T23:30:00.000Z" },
  ];
  assert.equal(getSpeciesAlbumYear(new Date("2026-12-31T23:30:00.000Z")), 2027);
  assert.deepEqual(buildSeasonCollections(catches, [], 2025), []);
  assert.deepEqual(buildSeasonCollections(catches, [], 2026).map(({ year, key, catchCount }) => [year, key, catchCount]), [[2026, "winter", 1]]);
  assert.equal(getSpeciesAlbumYear("invalid"), null);
});

test("trophy records rank the five heaviest measured catches and respect the requested limit", () => {
  const catches = [
    { id: "one", speciesKey: "carp", weightKg: 5 },
    { id: "two", speciesKey: "carp", weightKg: 4 },
    { id: "three", speciesKey: "pike", weightKg: 3 },
    { id: "estimated", speciesKey: "pike", weightKg: 99, weightSource: "estimated" },
    { id: "unmeasured", speciesKey: "pike", weightKg: null },
  ];

  assert.deepEqual(buildTrophyRecords(catches, catalog, 2).map(({ speciesKey, catch: record }) => [speciesKey, record.weightKg]), [
    ["carp", 5],
    ["carp", 4],
  ]);
  assert.deepEqual(buildTrophyRecords([], catalog), []);
});

test("future Catch stays in collection counts but cannot claim a personal or trophy record", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");
  const current = { id: "current", speciesKey: "carp", caughtAt: "2026-10-28T10:00:00.000Z", weightKg: 5, lengthCm: 80 };
  const future = { id: "future", speciesKey: "carp", caughtAt: "2026-10-29T10:00:00.000Z", weightKg: 100, lengthCm: 150 };
  const album = buildSpeciesAlbum([current, future], catalog, [], now);
  assert.equal(album[0].catchCount, 2);
  assert.equal(album[0].bestWeightKg, 5);
  assert.equal(album[0].bestLengthCm, 80);
  assert.deepEqual(buildTrophyRecords([current, future], catalog, 5, now).map(({ catch: record }) => record.id), ["current"]);
});
