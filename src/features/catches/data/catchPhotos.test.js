import test from "node:test";
import assert from "node:assert/strict";
import { getPrimaryAvailablePhoto, getPrimaryPhoto, normalizePrimaryPhotoId } from "./catchPhotos.js";

test("primary selection defaults to first and falls back when the primary is removed", () => {
  const photos = [{ id: "first" }, { id: "second" }];
  assert.equal(getPrimaryPhoto({ photos }).id, "first");
  assert.equal(getPrimaryPhoto({ photos, primaryPhotoId: "second" }).id, "second");
  assert.equal(normalizePrimaryPhotoId(photos.slice(1), "first"), "second");
  assert.equal(normalizePrimaryPhotoId([], "second"), null);
});

test("primary display falls back to available bytes while retaining metadata-only state", () => {
  const photos = [{ id: "primary" }, { id: "local", blob: new Blob(["photo"]) }];
  assert.equal(getPrimaryAvailablePhoto({ photos, primaryPhotoId: "primary" }).id, "local");
  assert.equal(getPrimaryAvailablePhoto({ photos: [{ id: "remote" }], primaryPhotoId: "remote" }).blob, undefined);
});
