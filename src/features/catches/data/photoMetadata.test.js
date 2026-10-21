import assert from "node:assert/strict";
import test from "node:test";
import { preserveSyncedPhotoMetadata } from "./photoMetadata.js";

test("catch edit keeps fresh synced metadata when bytes are unchanged", async () => {
  const blob = new Blob(["unchanged photo"], { type: "image/jpeg" });
  const cloud = { provider: "cloudinary", state: "synced", objectKey: "users/u/catches/c/photos/p/original", sha256: "known" };
  const { sha256Blob } = await import("./photoCloudProvider.js");
  cloud.sha256 = await sha256Blob(blob);
  const latest = { id: "c", photos: [{ id: "p", blob, type: blob.type, size: blob.size, cloud }] };
  const incoming = { ...latest, photos: [{ id: "p", blob: new Blob(["unchanged photo"], { type: "image/jpeg" }), type: blob.type, size: blob.size,
    cloud: { provider: "cloudinary", state: "pending", objectKey: null, sha256: null } }] };
  const merged = await preserveSyncedPhotoMetadata(incoming, latest);
  assert.deepEqual(merged.photos[0].cloud, cloud);
});

test("catch edit does not keep synced metadata for changed photo bytes", async () => {
  const blob = new Blob(["old"], { type: "image/jpeg" });
  const { sha256Blob } = await import("./photoCloudProvider.js");
  const latest = { id: "c", photos: [{ id: "p", blob, type: blob.type, size: blob.size,
    cloud: { provider: "cloudinary", state: "synced", objectKey: "key", sha256: await sha256Blob(blob) } }] };
  const incoming = { ...latest, photos: [{ id: "p", blob: new Blob(["new"], { type: "image/jpeg" }), type: blob.type, size: 3,
    cloud: { provider: "cloudinary", state: "pending" } }] };
  assert.equal((await preserveSyncedPhotoMetadata(incoming, latest)).photos[0].cloud.state, "localOnly");

  const staleReactSnapshot = { ...incoming, photos: [{ ...incoming.photos[0], cloud: latest.photos[0].cloud }] };
  assert.deepEqual((await preserveSyncedPhotoMetadata(staleReactSnapshot, latest)).photos[0].cloud,
    { state: "localOnly", provider: null, objectKey: null, sha256: null },
    "a stale React snapshot must not claim the new bytes are already synced");
});
