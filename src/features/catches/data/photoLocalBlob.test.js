import assert from "node:assert/strict";
import test from "node:test";
import { sha256Blob } from "./photoCloudProvider.js";
import { photoBlobErrorCode, readPhotoBlob, verifyPhotoBlobReadback } from "./photoLocalBlob.js";

class BrokenSafariBlob extends Blob {
  async arrayBuffer() { throw new DOMException("The object can not be found here.", "NotFoundError"); }
}

test("NotFoundError from Blob.arrayBuffer survives photo hash classification with its stage", async () => {
  const broken = new BrokenSafariBlob(["valid-looking bytes"], { type: "image/jpeg" });
  assert.ok(broken.size > 0);
  assert.equal(broken.type, "image/jpeg");
  await assert.rejects(sha256Blob(broken), (error) => error.name === "NotFoundError"
    && photoBlobErrorCode(error) === "photo_local_blob_unreadable" && error.photoStage === "photo-hash-local-blob");
});

test("photo readback verifies stored ArrayBuffer bytes and can rebuild a same-hash Blob", async () => {
  const source = new Blob([new Uint8Array([1, 2, 3, 255])], { type: "image/jpeg" });
  const bytes = await readPhotoBlob(source, "photo-verify-source-bytes");
  const restored = new Blob([new Uint8Array(bytes)], { type: source.type });
  const expected = await sha256Blob(source);
  const result = await verifyPhotoBlobReadback(source, restored, expected, sha256Blob);
  assert.equal(result.hash, expected);
  assert.equal(result.size, source.size);
  assert.equal(await sha256Blob(new Blob([new Uint8Array(bytes)], { type: source.type })), expected);
});

test("readback NotFoundError reports the local persistence stage", async () => {
  const source = new Blob(["canonical photo"], { type: "image/jpeg" });
  const expected = await sha256Blob(source);
  await assert.rejects(verifyPhotoBlobReadback(source, new BrokenSafariBlob(["canonical photo"], { type: source.type }), expected, sha256Blob),
    (error) => error.name === "NotFoundError" && photoBlobErrorCode(error) === "photo_local_blob_unreadable"
      && error.photoStage === "photo-readback-local-blob");
});
