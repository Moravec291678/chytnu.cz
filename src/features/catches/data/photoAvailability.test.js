import test from "node:test";
import assert from "node:assert/strict";
import { getPhotoAvailability, PHOTO_AVAILABILITY } from "./photoAvailability.js";

test("local and retryable cloud states remain pending rather than claiming a lost photo", () => {
  for (const state of ["localOnly", "pendingUpload", "uploadFailed", "pendingDelete"]) {
    assert.equal(getPhotoAvailability({ cloud: { state } }), PHOTO_AVAILABILITY.PENDING, state);
  }
  assert.equal(getPhotoAvailability({ cloud: { state: "synced" } }), PHOTO_AVAILABILITY.SYNCING);
});

test("confirmed unreadable or unavailable photo states are distinct from pending", () => {
  assert.equal(getPhotoAvailability({ cloud: { state: "unavailable" } }), PHOTO_AVAILABILITY.BROKEN);
  assert.equal(getPhotoAvailability({ localError: { code: "photo_local_blob_unreadable" } }), PHOTO_AVAILABILITY.BROKEN);
  assert.equal(getPhotoAvailability({ cloud: { state: "synced" } }, { errorCode: "cloudinary_asset_missing" }), PHOTO_AVAILABILITY.BROKEN);
  assert.equal(getPhotoAvailability({ cloud: { state: "synced" } }, { loadState: "error" }), PHOTO_AVAILABILITY.RETRYABLE_ERROR);
});

test("a photo moves from pending through download to available when bytes arrive", () => {
  const photo = { cloud: { state: "synced" } };
  assert.equal(getPhotoAvailability(photo), PHOTO_AVAILABILITY.SYNCING);
  assert.equal(getPhotoAvailability(photo, { loadState: "loading" }), PHOTO_AVAILABILITY.SYNCING);
  assert.equal(getPhotoAvailability({ ...photo, blob: new Blob(["photo"]) }), PHOTO_AVAILABILITY.AVAILABLE);
});
