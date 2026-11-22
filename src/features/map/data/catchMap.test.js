import test from "node:test";
import assert from "node:assert/strict";
import { buildPrivateCatchMarkers, getCatchCoordinates, groupVisibleCatchMarkers } from "./catchMap.js";
import { isRecordVisible } from "../../auth/data/localDataScope.js";

test("private map includes only catches with valid structured or unambiguous legacy coordinates", () => {
  const markers = buildPrivateCatchMarkers([
    { id: "structured", species: "Kapr", weightKg: 10, result: "released", coordinates: { latitude: 50.1, longitude: 14.4 } },
    { id: "legacy", species: "Štika", weightKg: 5, gpsLocation: "49.2, 16.6" },
    { id: "ambiguous", species: "Lín", gpsLocation: "49,2; 16,6" },
    { id: "missing", species: "Okoun" },
  ]);
  assert.deepEqual(markers.map((marker) => marker.id), ["structured", "legacy"]);
  assert.equal(markers[0].isPersonalRecord, true);
  assert.equal(markers[0].result, "released");
  assert.equal(markers[1].isPersonalRecord, false);
  assert.deepEqual(getCatchCoordinates({ gpsLocation: "49.2, 16.6" }), { latitude: 49.2, longitude: 16.6 });
});

test("map projection cannot reintroduce a different account's private catch", () => {
  const rows = [
    { id: "mine", ownerId: "angler-a", coordinates: { latitude: 50, longitude: 14 } },
    { id: "foreign", ownerId: "angler-b", coordinates: { latitude: 49, longitude: 15 } },
  ];
  const visible = rows.filter((record) => isRecordVisible(record, "angler-a"));
  assert.deepEqual(buildPrivateCatchMarkers(visible).map((marker) => marker.id), ["mine"]);
});

test("private map is a deterministic projection after edit, deletion, restore, or sync replacement", () => {
  const original = [{ id: "catch", species: "Kapr", coordinates: { latitude: 50, longitude: 14 }, weightKg: null }];
  assert.equal(buildPrivateCatchMarkers(original)[0].weightKg, null);
  assert.equal(buildPrivateCatchMarkers([{ ...original[0], coordinates: { latitude: 51, longitude: 15 } }])[0].latitude, 51);
  assert.deepEqual(buildPrivateCatchMarkers([]), []);
  assert.deepEqual(buildPrivateCatchMarkers(structuredClone(original)), buildPrivateCatchMarkers(original));
});

test("the private map does not mark a personal record unless that real record has coordinates", () => {
  const markers = buildPrivateCatchMarkers([
    { id: "best", weightKg: 15, coordinates: null },
    { id: "mapped", weightKg: 8, coordinates: { latitude: 50, longitude: 14 } },
  ]);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].id, "mapped");
  assert.equal(markers[0].isPersonalRecord, false);
});

test("private map bounds rendered groups on mobile while preserving every visible catch", () => {
  const markers = Array.from({ length: 5000 }, (_, id) => ({
    id, latitude: id % 600 - 50, longitude: Math.floor(id / 600) * 50 - 50,
  }));
  const project = ([latitude, longitude]) => ({ x: latitude, y: longitude });
  const viewport = { x: 390, y: 330 };
  const groups = groupVisibleCatchMarkers(markers, project, viewport);
  assert.ok(groups.length <= Math.ceil(390 / 48) * Math.ceil(330 / 48));
  assert.ok(groups.length < 100);
  const visible = markers.filter(({ latitude, longitude }) =>
    latitude >= 0 && latitude < viewport.x && longitude >= 0 && longitude < viewport.y);
  assert.deepEqual(groups.flat().map(marker => marker.id).sort((a,b) => a-b), visible.map(marker => marker.id));
  for (const group of groups) assert.equal(group[0], markers[group[0].id]);
});

test("zoom separates nearby private catch markers without changing their coordinates", () => {
  const markers = [{ latitude: 1, longitude: 2 }, { latitude: 2, longitude: 3 }];
  const viewport = { x: 390, y: 330 };
  assert.deepEqual(groupVisibleCatchMarkers(markers, ([lat, lon]) => ({ x: lat, y: lon }), viewport), [markers]);
  assert.deepEqual(groupVisibleCatchMarkers(markers, ([lat, lon]) => ({ x: lat * 48, y: lon * 48 }), viewport), markers.map(marker => [marker]));
});
