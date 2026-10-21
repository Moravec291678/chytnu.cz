import assert from "node:assert/strict";
import test from "node:test";
import { requestPhotoStoragePersistence } from "./photoStorageDurability.js";

test("storage persistence is requested only when not already granted", async () => {
  let requestCount = 0;
  assert.equal(await requestPhotoStoragePersistence({
    async persisted() { return true; },
    async persist() { requestCount += 1; return true; },
  }), true);
  assert.equal(requestCount, 0);
});

test("storage persistence request is best effort and never blocks local photo storage", async () => {
  let requestCount = 0;
  assert.equal(await requestPhotoStoragePersistence({
    async persisted() { return false; },
    async persist() { requestCount += 1; return false; },
  }), false);
  assert.equal(requestCount, 1);
  assert.equal(await requestPhotoStoragePersistence({
    async persisted() { throw new Error("unsupported"); },
    async persist() { throw new Error("must not be called"); },
  }), false);
  assert.equal(await requestPhotoStoragePersistence(null), false);
});
