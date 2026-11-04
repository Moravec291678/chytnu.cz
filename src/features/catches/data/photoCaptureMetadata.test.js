import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCaptureDate, readPhotoCaptureMetadata } from "./photoCaptureMetadata.js";

function makeExifJpeg({ offset } = {}) {
  const tiff = new Uint8Array(offset ? 228 : 190);
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
  if (offset) {
    view.setUint32(18, 190, true);
    view.setUint16(190, 2, true);
    view.setUint16(192, 0x9003, true);
    view.setUint16(194, 2, true);
    view.setUint32(196, 20, true);
    view.setUint32(200, 170, true);
    view.setUint16(204, 0x9011, true);
    view.setUint16(206, 2, true);
    view.setUint32(208, 7, true);
    view.setUint32(212, 220, true);
    tiff.set(new TextEncoder().encode(`${offset}\0`), 220);
  }

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

test("EXIF date validation rejects impossible calendar dates rather than rolling forward", () => {
  for (const invalid of ["2026:02:31 10:00:00", "2026:13:01 10:00:00", "2026:11:04 24:01:00", "2026:11:04 10:60:00", "not-a-date"]) {
    assert.equal(normalizeCaptureDate(invalid), null);
  }
  assert.equal(normalizeCaptureDate("2024:02:29 10:00:00"), new Date(2024, 1, 29, 10).toISOString());
  assert.equal(normalizeCaptureDate("2026:02:29 10:00:00+02:00"), null);
});

test("EXIF explicit UTC and separate original timezone offset preserve the actual instant", () => {
  assert.equal(normalizeCaptureDate("2026-11-04T12:00:00Z"), "2026-11-04T12:00:00.000Z");
  assert.equal(normalizeCaptureDate("2026-11-04 12:00:00 UTC"), "2026-11-04T12:00:00.000Z");
  assert.equal(normalizeCaptureDate("2026:11:04 12:00:00", "+02:00"), "2026-11-04T10:00:00.000Z");
  assert.equal(normalizeCaptureDate("2026:11:04 12:00:00.123", "-0530"), "2026-11-04T17:30:00.123Z");
  assert.equal(normalizeCaptureDate("2026:11:04 12:00:00+02:00", "+03:00"), "2026-11-04T10:00:00.000Z");
  for (const invalid of ["+25:00", "+14:01", "+02:90", "unknown"]) {
    assert.equal(normalizeCaptureDate("2026:11:04 12:00:00", invalid), null);
  }
});

test("invalid calendar date remains rejected through the real EXIF parser", async () => {
  const bytes = makeExifJpeg();
  bytes.set(new TextEncoder().encode("2026:02:31 13:35:42\0"), 182);
  const result = await readPhotoCaptureMetadata(new Blob([bytes], { type: "image/jpeg" }));
  assert.equal(result.capturedAt, null);
  assert.deepEqual(result.coordinates, { latitude: 50, longitude: 14 });
});

test("real EXIF OffsetTimeOriginal is applied without the Date reviver discarding it", async () => {
  const bytes = makeExifJpeg({ offset: "+02:00" });
  const result = await readPhotoCaptureMetadata(new Blob([bytes], { type: "image/jpeg" }));
  assert.equal(result.capturedAt, "2026-10-28T11:35:42.000Z");
  assert.deepEqual(result.coordinates, { latitude: 50, longitude: 14 });
});
