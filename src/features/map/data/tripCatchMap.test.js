import test from "node:test";
import assert from "node:assert/strict";
import { buildTripCatchMarkers, groupNearbyTripMarkers, tripMapViewport } from "./tripCatchMap.js";

const scope = { ownerId: "angler-a", scopeKey: "account:angler-a" };
const trip = { ...scope, id: "trip-a" };
const catchRecord = (id, latitude = 50, longitude = 14) => ({ ...scope, id, tripId: trip.id,
  caughtAt: "2026-11-08T09:00:00Z", coordinates: { latitude, longitude }, species: "Druh zatím neurčen" });

test("one or four individual catches produce exactly their own real coordinates and fit every point", () => {
  const one = buildTripCatchMarkers([catchRecord("one")], trip, scope);
  assert.deepEqual(tripMapViewport(one), { center: [50, 14], zoom: 14 });
  const rows = [catchRecord("one"), catchRecord("two", 50.004, 14.001), catchRecord("three", 50.009, 14.002), catchRecord("four", 50.013, 14.003)];
  const markers = buildTripCatchMarkers(rows, trip, scope);
  assert.equal(markers.length, 4);
  assert.equal(groupNearbyTripMarkers(markers).length, 4);
  assert.deepEqual(new Set(tripMapViewport(markers).bounds.map(JSON.stringify)), new Set(rows.map(row => [row.coordinates.latitude, row.coordinates.longitude]).map(JSON.stringify)));
});

test("the private trip projection rejects other trips, deleted catches, foreign owners and mismatched scopes", () => {
  const rows = [catchRecord("mine"), { ...catchRecord("other-trip"), tripId: "trip-b" },
    { ...catchRecord("deleted"), deletedAt: "2026-11-08T10:00:00Z" }, { ...catchRecord("deleted-flag"), deleted: true },
    { ...catchRecord("foreign"), ownerId: "angler-b", scopeKey: "account:angler-b" },
    { ...catchRecord("forged-scope"), ownerId: "angler-b" }];
  assert.deepEqual(buildTripCatchMarkers(rows, trip, scope).map(marker => marker.id), ["mine"]);
  assert.deepEqual(buildTripCatchMarkers(rows, { ...trip, ownerId: "angler-b" }, scope), []);
  assert.deepEqual(buildTripCatchMarkers(rows, trip, { ...scope, ownerId: "angler-b" }), []);
});

test("missing, blank, invalid or zero placeholder coordinates never generate a fake pin; valid legacy GPS survives", () => {
  const rows = [null, { ...catchRecord("missing"), coordinates: null }, catchRecord("zero", 0, 0), catchRecord("range", 91, 14),
    catchRecord("null", null, null), catchRecord("blank", "", ""),
    { ...catchRecord("legacy"), coordinates: null, gpsLocation: "49.2, 16.6" }];
  const markers = buildTripCatchMarkers(rows, trip, scope);
  assert.deepEqual(markers.map(marker => marker.id), ["legacy"]);
  assert.deepEqual(tripMapViewport([]), null);
});

test("explicit unreliable live GPS accuracy is rejected without inventing precision for manual or EXIF locations", () => {
  const rows = [-1, 0, Infinity, 100000].map((accuracyMeters, i) => ({ ...catchRecord(`bad${i}`), gpsSource: "live-gps", locationEvidence: { accuracyMeters } }));
  rows.push({ ...catchRecord("live"), gpsSource: "live-gps", locationEvidence: { accuracyMeters: 8 } },
    { ...catchRecord("manual"), gpsSource: "manual-map" }, { ...catchRecord("exif"), gpsSource: "photo-exif" });
  const markers = buildTripCatchMarkers(rows, trip, scope);
  assert.deepEqual(markers.map(marker => marker.id), ["exif", "live", "manual"]);
  assert.equal(markers.find(marker => marker.id === "live").accuracyMeters, 8);
  assert.equal(markers.find(marker => marker.id === "exif").accuracyMeters, null);
});

test("edits, reassignment, deletion and a second-device restored projection replace pins without duplicates", () => {
  const original = catchRecord("catch");
  const edited = { ...original, coordinates: { latitude: 49, longitude: 15 } };
  assert.equal(buildTripCatchMarkers([edited], trip, scope)[0].latitude, 49);
  const moved = { ...edited, tripId: "trip-b" };
  assert.deepEqual(buildTripCatchMarkers([moved], trip, scope), []);
  assert.equal(buildTripCatchMarkers([moved], { ...trip, id: "trip-b" }, scope).length, 1);
  assert.deepEqual(buildTripCatchMarkers([], trip, scope), []);
  assert.deepEqual(buildTripCatchMarkers(JSON.parse(JSON.stringify([edited])), trip, scope), buildTripCatchMarkers([edited], trip, scope));
  assert.equal(buildTripCatchMarkers([original, edited], trip, scope).length, 1);
  assert.deepEqual(buildTripCatchMarkers([original, { ...edited, deleted: true }], trip, scope), []);
  assert.deepEqual(buildTripCatchMarkers([original, moved], trip, scope), []);
});

test("near-identical catch positions keep every catch accessible in a shared popup group without moving GPS", () => {
  const rows = [catchRecord("first"), catchRecord("second"), catchRecord("third", 50.000001, 14.000001)];
  const markers = buildTripCatchMarkers(rows, trip, scope), groups = groupNearbyTripMarkers(markers);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 3);
  for (const marker of groups[0]) assert.deepEqual({ latitude: marker.latitude, longitude: marker.longitude }, rows.find(row => row.id === marker.id).coordinates);
});

test("markers distinguish AI suggestions from confirmed fish and display only measured weight", () => {
  const digest = "a".repeat(64);
  const row = { ...catchRecord("suggested"), captureMode: "quick", lengthCm: 38, weightKg: 1.5, weightSource: "estimated",
    photos: [{ id: "photo", contentSha256: digest }],
    aiSpeciesSuggestion: { status: "suggestion", speciesKey: "commonCarp", photoId: "photo", ownerId: scope.ownerId, sourceSha256: digest } };
  const marker = buildTripCatchMarkers([row], trip, scope)[0];
  assert.equal(marker.aiSuggested, true); assert.equal(marker.species, "Kapr obecný"); assert.equal(marker.weightKg, null); assert.equal(marker.lengthCm, 38);
  const corrected = buildTripCatchMarkers([{ ...row, speciesKey: "northernPike", species: "Štika obecná", weightSource: "manual" }], trip, scope)[0];
  assert.equal(corrected.aiSuggested, false); assert.equal(corrected.species, "Štika obecná"); assert.equal(corrected.weightKg, 1.5);
});

test("optional marker details tolerate malformed legacy photo and species metadata", () => {
  const markers = buildTripCatchMarkers([{ ...catchRecord("legacy-metadata"), species: {}, photos: [null, "bad"] }], trip, scope);
  assert.equal(markers.length, 1); assert.equal(markers[0].species, "Druh zatím neurčen"); assert.equal(markers[0].photo, null);
});
