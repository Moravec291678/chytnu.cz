import test from "node:test";
import assert from "node:assert/strict";
import { readPhotoCaptureMetadata } from "./photoCaptureMetadata.js";

function makeExifJpeg() {
  const tiff = new Uint8Array(190);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);
  const exifPointer = 10;
  view.setUint16(exifPointer, 0x8769, true);
  view.setUint16(exifPointer + 2, 4, true);
  view.setUint32(exifPointer + 4, 1, true);
  view.setUint32(exifPointer + 8, 38, true);
  const gpsPointer = exifPointer + 12;
  view.setUint16(gpsPointer, 0x8825, true);
  view.setUint16(gpsPointer + 2, 4, true);
  view.setUint32(gpsPointer + 4, 1, true);
  view.setUint32(gpsPointer + 8, 62, true);
  view.setUint32(34, 0, true);

  view.setUint16(38, 1, true);
  view.setUint16(40, 0x9003, true);
  view.setUint16(42, 2, true);
  view.setUint32(44, 20, true);
  view.setUint32(48, 170, true);
  view.setUint32(52, 0, true);
  tiff.set(new TextEncoder().encode("2026:10:28 13:35:42\0"), 170);

  view.setUint16(62, 4, true);
  const gpsTags = [
    { tag: 1, type: 2, count: 2, inline: [0x4e, 0] },
    { tag: 2, type: 5, count: 3, offset: 116 },
    { tag: 3, type: 2, count: 2, inline: [0x45, 0] },
    { tag: 4, type: 5, count: 3, offset: 140 },
  ];
  gpsTags.forEach((entry, index) => {
    const offset = 64 + index * 12;
    view.setUint16(offset, entry.tag, true);
    view.setUint16(offset + 2, entry.type, true);
    view.setUint32(offset + 4, entry.count, true);
    if (entry.inline) {
      view.setUint8(offset + 8, entry.inline[0]);
      view.setUint8(offset + 9, entry.inline[1]);
    } else view.setUint32(offset + 8, entry.offset, true);
  });
  view.setUint32(116, 50, true); view.setUint32(120, 1, true);
  view.setUint32(124, 0, true); view.setUint32(128, 1, true);
  view.setUint32(132, 0, true); view.setUint32(136, 1, true);
  view.setUint32(140, 14, true); view.setUint32(144, 1, true);
  view.setUint32(148, 0, true); view.setUint32(152, 1, true);
  view.setUint32(156, 0, true); view.setUint32(160, 1, true);

  const signature = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0]);
  const payloadLength = signature.length + tiff.length;
  const jpeg = new Uint8Array(2 + 2 + 2 + payloadLength + 2);
  const jpegView = new DataView(jpeg.buffer);
  jpeg.set([0xff, 0xd8, 0xff, 0xe1]);
  jpegView.setUint16(4, payloadLength + 2, false);
  jpeg.set(signature, 6);
  jpeg.set(tiff, 12);
  jpeg.set([0xff, 0xd9], jpeg.length - 2);
  return jpeg;
}

test("reads original date and GPS from JPEG EXIF before image normalization strips metadata", async () => {
  const bytes = makeExifJpeg();
  const file = { type: "image/jpeg", name: "catch.jpg", arrayBuffer: async () => bytes.buffer };
  const result = await readPhotoCaptureMetadata(file);
  assert.equal(result.capturedAt, new Date(2026, 9, 28, 13, 35, 42).toISOString());
  assert.deepEqual(result.coordinates, { latitude: 50, longitude: 14 });
});

test("unsupported or metadata-free image formats safely return no capture metadata", async () => {
  assert.equal(await readPhotoCaptureMetadata({ type: "image/heic", arrayBuffer: async () => new ArrayBuffer(0) }), null);
  assert.equal(await readPhotoCaptureMetadata({ type: "image/jpeg", arrayBuffer: async () => new ArrayBuffer(0) }), null);
  assert.equal(await readPhotoCaptureMetadata(null), null);
});
