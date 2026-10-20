import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PHOTO_FRAME, hasCustomPhotoFrame, normalizePhotoFrame } from "./photoFraming.js";

test("old photos use the centered default frame", () => {
  assert.deepEqual(normalizePhotoFrame({}), DEFAULT_PHOTO_FRAME);
  assert.equal(hasCustomPhotoFrame({}), false);
});

test("photo frame values are bounded and invalid metadata falls back safely", () => {
  assert.deepEqual(normalizePhotoFrame({ focalX: 4, focalY: -2, zoom: 9 }), { focalX: 1, focalY: 0, zoom: 2 });
  assert.deepEqual(normalizePhotoFrame({ focalX: "bad", focalY: null, zoom: 0 }), DEFAULT_PHOTO_FRAME);
  assert.equal(hasCustomPhotoFrame({ focalX: 0.2, focalY: 0.7, zoom: 1.3 }), true);
});
