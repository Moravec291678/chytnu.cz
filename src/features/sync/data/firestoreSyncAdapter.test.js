import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeRemotePhotoMetadata, toRemoteRecord } from "./firestoreSyncAdapter.js";

test("Firestore catch projection preserves supported stored conditions only", () => {
  const record = {
    id: "catch-1",
    ownerId: "angler-1",
    conditions: {
      airTempC: -3.5,
      waterTempC: 4,
      pressureHpa: 1018,
      windKmh: 9.5,
      moonPhase: "waxingCrescent",
      weather: "polojasno",
      internalOnly: "not a catch condition",
    },
    conditionSources: { airTempC: "auto", pressureHpa: "manual", unknown: "auto" },
  };

  assert.deepEqual(
    toRemoteRecord("catch", record, "angler-1").conditions,
    {
      airTempC: -3.5,
      waterTempC: 4,
      pressureHpa: 1018,
      windKmh: 9.5,
      moonPhase: "waxingCrescent",
      weather: "polojasno",
    },
  );
  assert.deepEqual(toRemoteRecord("catch", record, "angler-1").conditionSources, { airTempC: "auto", pressureHpa: "manual" });
});

test("Firestore catch projection writes null when conditions were not recorded", () => {
  const record = { id: "catch-2", ownerId: "angler-1" };

  assert.equal(toRemoteRecord("catch", record, "angler-1").conditions, null);
  assert.equal(toRemoteRecord("catch", record, "angler-1").conditionSources, null);
});

test("Firestore catch projection keeps ordered local-only photo metadata and crop fields", () => {
  const record = {
    id: "catch-photo",
    ownerId: "angler-1",
    photos: [{
      id: "photo-1", name: "kapr.jpg", type: "image/jpeg", size: 123,
      focalX: 0.2, focalY: 0.8, zoom: 1.4,
      storagePath: "legacy/cloud/path", sha256: "a".repeat(64),
    }],
  };
  const projected = toRemoteRecord("catch", record, "angler-1");
  assert.deepEqual(projected.photos, [{
    id: "photo-1", name: "kapr.jpg", type: "image/jpeg", size: 123,
    focalX: 0.2, focalY: 0.8, zoom: 1.4,
    cloud: { state: "localOnly", provider: null, objectKey: null, sha256: null },
  }]);
  assert.deepEqual(projected.photoRefs, { "photo-1": true });
  assert.equal(projected.primaryPhotoId, "photo-1");
  const synced = toRemoteRecord("catch", { ...record, photos: [{ ...record.photos[0], cloud: {
    state: "synced", provider: "fake", objectKey: "users/angler-1/catches/catch-photo/photos/photo-1/original",
    sha256: "b".repeat(64), signedUrl: "must-not-leak",
  } }] }, "angler-1");
  assert.deepEqual(synced.photos[0].cloud, {
    state: "synced", provider: "fake",
    objectKey: "users/angler-1/catches/catch-photo/photos/photo-1/original", sha256: "b".repeat(64),
  });
  assert.equal("blob" in toRemoteRecord("catch", { ...record, photos: [{ ...record.photos[0], blob: new Blob(["bytes"]) }] }, "angler-1").photos[0], false);
  assert.throws(() => toRemoteRecord("catch", { ...record, photos: [{ ...record.photos[0], id: "bad/id" }] }, "angler-1"), /platná|jedinečná/);
  assert.throws(() => toRemoteRecord("catch", { ...record, photos: Array.from({ length: 11 }, (_, index) => ({ id: `photo-${index}` })) }, "angler-1"), /limit 10/);
});

test("one invalid or duplicate photo metadata record is isolated from valid Catch photos", () => {
  const diagnostics = [];
  const photos = sanitizeRemotePhotoMetadata([
    { id: "valid-1", name: "a.jpg", type: "image/jpeg", size: 5, focalX: 0.5, focalY: 0.5, zoom: 1,
      cloud: { state: "localOnly", provider: null, objectKey: null, sha256: null } },
    { id: "invalid-1", name: "bad.jpg", type: "image/jpeg", size: 5, focalX: 0.5, focalY: 0.5, zoom: 1,
      cloud: { state: "synced", provider: "cloudinary", objectKey: "wrong/path", sha256: "bad" } },
    { id: "valid-1", name: "duplicate.jpg", type: "image/jpeg", size: 5, focalX: 0.5, focalY: 0.5, zoom: 1,
      cloud: { state: "localOnly", provider: null, objectKey: null, sha256: null } },
    { id: "valid-2", name: "b.webp", type: "image/webp", size: 8, focalX: 0.4, focalY: 0.6, zoom: 1.2,
      cloud: { state: "localOnly", provider: null, objectKey: null, sha256: null } },
  ], "angler-a", "catch-1", (diagnostic) => diagnostics.push(diagnostic));
  assert.deepEqual(photos.map((photo) => photo.id), ["valid-1", "invalid-1", "valid-2"]);
  assert.equal(photos[1].cloud.state, "unavailable");
  assert.equal(diagnostics.length, 2);
  assert.ok(diagnostics.every((item) => item.syncStage === "pull:photos"));
  assert.doesNotMatch(JSON.stringify(diagnostics), /angler-a|catch-1|valid-1/);
});
