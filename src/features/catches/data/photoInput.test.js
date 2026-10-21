import assert from "node:assert/strict";
import test from "node:test";
import { isHeicPhoto, normalizePhotoForUpload } from "./photoInput.js";

function canvasFactory() {
  return { width: 0, height: 0, getContext: () => ({ drawImage() {} }),
    toBlob(callback, type) { callback(new Blob(["jpeg bytes"], { type })); } };
}

test("HEIC and HEIF are identified by MIME type or extension", () => {
  assert.equal(isHeicPhoto({ type: "image/heic" }), true);
  assert.equal(isHeicPhoto({ name: "IMG_1234.HEIF", type: "application/octet-stream" }), true);
  assert.equal(isHeicPhoto({ name: "photo.jpg", type: "image/jpeg" }), false);
});

test("HEIC is converted then normalized to a browser and Cloudinary compatible JPEG", async () => {
  const source = new Blob(["heic source"], { type: "application/octet-stream" });
  source.name = "IMG_1.HEIC";
  let converted = false;
  const result = await normalizePhotoForUpload(source, {
    convertHeic: async () => async ({ blob, toType }) => {
      assert.equal(blob, source);
      assert.equal(toType, "image/png");
      converted = true;
      return new Blob(["decoded pixels"], { type: "image/png" });
    },
    decode: async () => ({ width: 4000, height: 2000, close() {} }),
    canvasFactory,
  });
  assert.equal(converted, true);
  assert.equal(result.type, "image/jpeg");
  assert.equal(result.text && typeof result.text, "function");
});

test("ordinary JPEG uses the existing 1920px and 0.82 optimization without loading HEIC decoder", async () => {
  const source = new Blob(["jpeg source"], { type: "image/jpeg" });
  let decoderRequested = false;
  let drawnAt = null;
  let quality = null;
  const result = await normalizePhotoForUpload(source, {
    convertHeic: async () => { decoderRequested = true; throw new Error("must not load"); },
    decode: async () => ({ width: 4000, height: 2000, close() {} }),
    canvasFactory: () => ({ width: 0, height: 0, getContext: () => ({ drawImage(_image, _x, _y, width, height) { drawnAt = [width, height]; } }),
      toBlob(callback, type, jpegQuality) { quality = jpegQuality; callback(new Blob(["jpeg output"], { type })); } }),
  });
  assert.equal(decoderRequested, false);
  assert.deepEqual(drawnAt, [1920, 960]);
  assert.equal(quality, 0.82);
  assert.equal(result.type, "image/jpeg");
});

test("unrecognized image formats fail with a clear supported-format message", async () => {
  await assert.rejects(() => normalizePhotoForUpload(new Blob(["x"], { type: "application/octet-stream" })), /JPG, PNG, WebP, AVIF, HEIC a HEIF/);
});
