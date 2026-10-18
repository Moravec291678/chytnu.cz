import test from "node:test";
import assert from "node:assert/strict";
import { buildSpeciesAlbum } from "./speciesAlbum.js";

const catalog = [{ key: "carp", label: "Kapr" }, { key: "pike", label: "Štika" }];

test("album derives empty and discovered species from the catch journal", () => {
  const empty = buildSpeciesAlbum([], catalog);
  assert.deepEqual(empty.map((item) => [item.discovered, item.catchCount]), [[false, 0], [false, 0]]);

  const album = buildSpeciesAlbum([{ speciesKey: "carp", caughtAt: "2026-01-02T00:00:00.000Z", weightKg: null, lengthCm: 50 }], catalog);
  assert.equal(album[0].discovered, true);
  assert.equal(album[0].bestWeightKg, null);
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
