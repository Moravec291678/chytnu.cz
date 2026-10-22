import assert from "node:assert/strict";
import test from "node:test";
import { isHeicPhoto, normalizePhotoForUpload, preparePhotoForStorageAndUpload } from "./photoInput.js";
import { sha256Blob } from "./photoCloudProvider.js";

function canvasFactory() {
  return { width: 0, height: 0, getContext: () => ({ drawImage() {} }),
    toBlob(callback, type) { callback(new Blob(["jpeg bytes"], { type })); } };
}

test("HEIC and HEIF are identified by MIME type or extension", () => {
  assert.equal(isHeicPhoto({ type: "image/heic" }), true);
  assert.equal(isHeicPhoto({ name: "IMG_1234.HEIF", type: "application/octet-stream" }), true);
  assert.equal(isHeicPhoto({ name: "IMG_1234.HEIC", type: "" }), true);
  assert.equal(isHeicPhoto({ name: "photo.jpg", type: "image/jpeg" }), false);
});

test("HEIC is converted then normalized to a browser and Cloudinary compatible JPEG", async () => {
  const source = new Blob(["heic source"], { type: "application/octet-stream" });
  source.name = "IMG_1.HEIC";
  let converted = false;
  const result = await normalizePhotoForUpload(source, {
    convertHeic: async () => async ({ blob, toType }) => {
      assert.notEqual(blob, source);
      assert.equal(await blob.text(), await source.text());
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

test("HEIC conversion failure falls back to native browser decoding before giving up", async () => {
  const source = new Blob(["future HEIC variant"], { type: "image/heic" });
  let decodedSource;
  const result = await normalizePhotoForUpload(source, {
    convertHeic: async () => async () => { throw new Error("converter does not recognize this variant"); },
    decode: async (blob) => { decodedSource = blob; return { width: 800, height: 600, close() {} }; },
    canvasFactory,
  });
  assert.notEqual(decodedSource, source);
  assert.equal(await decodedSource.text(), await source.text());
  assert.equal(result.type, "image/jpeg");
});

test("HEIC decode failure rejects with recoverable error instead of silently storing unsyncable photo", async () => {
  const source = new File(["original HEIC"], "IMG_2.HEIC", { type: "image/heic" });
  await assert.rejects(preparePhotoForStorageAndUpload(source, {
    convertHeic: async () => async () => { throw new Error("unsupported HEIC variant"); },
    decode: async () => { throw new Error("browser decode failed"); },
  }), (error) => error.code === "photo_unsupported" && /HEIC.*JPEG/.test(error.message));
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

test("JPG alias, PNG, WebP, and AVIF normalize through the same browser image pipeline", async () => {
  const cases = [
    { input: new File(["jpg alias"], "legacy.bin", { type: "image/jpg" }), expectedInputType: "image/jpeg" },
    { input: new File(["png"], "photo.png", { type: "image/png" }), expectedInputType: "image/png" },
    { input: new File(["webp"], "photo.webp", { type: "image/webp" }), expectedInputType: "image/webp" },
    { input: new File(["avif"], "photo.avif", { type: "image/avif" }), expectedInputType: "image/avif" },
    { input: new File(["legacy extension"], "legacy.jpeg", { type: "" }), expectedInputType: "image/jpeg" },
  ];
  for (const item of cases) {
    let decodedType = "";
    const result = await normalizePhotoForUpload(item.input, {
      convertHeic: async () => { throw new Error("HEIC converter must not load"); },
      decode: async (source) => { decodedType = source.type; return { width: 640, height: 480, close() {} }; },
      canvasFactory,
    });
    assert.equal(decodedType, item.expectedInputType);
    assert.equal(result.type, "image/jpeg");
  }
});

test("canonical photo preparation returns hash, size, type, and the final stored Blob", async () => {
  const prepared = await preparePhotoForStorageAndUpload(new Blob(["source JPEG"], { type: "image/jpeg" }), {
    decode: async () => ({ width: 320, height: 240, close() {} }),
    canvasFactory: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }),
      toBlob(callback, type) { callback(new Blob(["normalized JPEG bytes"], { type })); } }),
  });
  assert.equal(prepared.type, "image/jpeg");
  assert.equal(prepared.size, prepared.blob.size);
  assert.equal(prepared.sha256, await sha256Blob(prepared.blob));
});

test("unrecognized image formats fail with a clear supported-format message", async () => {
  await assert.rejects(() => normalizePhotoForUpload(new Blob(["x"], { type: "application/octet-stream" })), /JPG, PNG, WebP, AVIF, HEIC a HEIF/);
});

test("picker JPEG File is detached before decoding and stored with final metadata", async () => {
  const file = new File(["camera bytes"], "camera.jpg", { type: "image/jpeg" });
  const prepared = await preparePhotoForStorageAndUpload(file, {
    decode: async (source) => {
      assert.equal(source instanceof File, false);
      assert.notEqual(source, file);
      assert.equal(await source.text(), "camera bytes");
      return { width: 100, height: 100 };
    }, canvasFactory,
  });
  assert.equal(prepared.blob instanceof File, false);
  assert.equal(prepared.uploadReady, true);
  assert.equal(prepared.sha256, await sha256Blob(prepared.blob));
});

test("source over 10 MB normalizes successfully to a small JPEG", async () => {
  const file = new File([new Uint8Array(11 * 1024 * 1024)], "large.jpg", { type: "image/jpeg" });
  const prepared = await preparePhotoForStorageAndUpload(file, {
    decode: async () => ({ width: 4000, height: 3000 }), canvasFactory,
  });
  assert.equal(prepared.size, 10);
});

test("50 MB source safety limit rejects before reading bytes", async () => {
  await assert.rejects(preparePhotoForStorageAndUpload({ size: 51 * 1024 * 1024,
    arrayBuffer: () => assert.fail("must not read oversized input") }), { code: "photo_too_large" });
});

test("final output over 10 MB is rejected and decoder released", async () => {
  let closed = false;
  await assert.rejects(preparePhotoForStorageAndUpload(new File(["jpg"], "photo.jpg", { type: "image/jpeg" }), {
    decode: async () => ({ width: 4000, height: 3000, close() { closed = true; } }),
    canvasFactory: () => ({ getContext: () => ({ drawImage() {} }),
      toBlob(callback, type) { callback(new Blob([new Uint8Array(11 * 1024 * 1024)], { type })); } }),
  }), { code: "photo_too_large" });
  assert.equal(closed, true);
});

for (const bitmapAvailable of [true, false]) {
  test(`native Image decoder fallback works when ImageBitmap is ${bitmapAvailable ? "rejecting" : "missing"}`, async (t) => {
    const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
    const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
    let revoked = 0;
    Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: bitmapAvailable ? async () => { throw new Error("unsupported"); } : undefined });
    Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
      naturalWidth = 100;
      naturalHeight = 100;
      set src(_value) { this.onload(); }
    } });
    t.mock.method(URL, "createObjectURL", () => "blob:test");
    t.mock.method(URL, "revokeObjectURL", () => { revoked++; });
    t.after(() => {
      if (originalBitmap) Object.defineProperty(globalThis, "createImageBitmap", originalBitmap);
      else delete globalThis.createImageBitmap;
      if (originalImage) Object.defineProperty(globalThis, "Image", originalImage);
      else delete globalThis.Image;
    });
    const result = await normalizePhotoForUpload(new File(["jpeg"], "photo.jpg", { type: "image/jpeg" }), { canvasFactory });
    assert.equal(result.type, "image/jpeg");
    assert.equal(revoked, 1);
  });
}
