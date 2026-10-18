import test from "node:test";
import assert from "node:assert/strict";
import { buildPrivateCatchMarkers, getCatchCoordinates } from "./catchMap.js";
import { isRecordVisible } from "../../auth/data/localDataScope.js";

test("private map includes only catches with valid structured or unambiguous legacy coordinates", () => {
  const markers = buildPrivateCatchMarkers([
    { id: "structured", species: "Kapr", coordinates: { latitude: 50.1, longitude: 14.4 } },
    { id: "legacy", species: "Štika", gpsLocation: "49.2, 16.6" },
    { id: "ambiguous", species: "Lín", gpsLocation: "49,2; 16,6" },
    { id: "missing", species: "Okoun" },
  ]);
  assert.deepEqual(markers.map((marker) => marker.id), ["structured", "legacy"]);
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
