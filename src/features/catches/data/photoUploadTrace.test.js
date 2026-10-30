import assert from "node:assert/strict";
import test from "node:test";
import { createPhotoUploadTrace } from "./photoUploadTrace.js";

test("trace survives reload with a bounded ring and cannot retain secrets", () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const trace = createPhotoUploadTrace({ storage });
  for (let index = 0; index < 300; index += 1) trace.record(`photo-${index}`, "sign_pass", {
    bytes: 12, mimeType: "image/jpeg", httpStatus: 200, ownerId: "secret", token: "secret", objectKey: "secret",
    name: "secret", errorCode: "secret", sourceMimeType: "secret", originalExtension: "secret", format: "secret",
  });
  assert.equal(saved.includes("secret"), false);
  const restored = createPhotoUploadTrace({ storage });
  assert.equal(restored.read().length, 250);
  assert.equal(restored.read()[0].photoId, "photo-50");
  assert.equal(restored.read()[0].errorCode, "unknown");
  const copy = restored.read(); copy[0].bytes = 99;
  assert.equal(restored.read()[0].bytes, 12);
});

test("trace rejects invalid stages and sanitizes restored storage", () => {
  const storage = { getItem: () => JSON.stringify([{ photoId: "photo", stage: "sign_pass", timestamp: 1, token: "secret" }, { photoId: "photo", stage: "secret" }]) };
  const trace = createPhotoUploadTrace({ storage });
  trace.record("https://secret", "sign_pass");
  trace.record("photo", "secret");
  assert.deepEqual(trace.read(), [{ photoId: "photo", stage: "sign_pass", timestamp: 1 }]);
});

test("delivery timings and Cloudinary HTTP statuses are retained without URLs or credentials", () => {
  const trace = createPhotoUploadTrace();
  trace.record("photo-a", "photo_delivery_fail", {
    durationMs: 321.4, httpStatus: 502, providerStatus: 401,
    url: "https://api.cloudinary.com/private", token: "secret", photoBytes: "secret",
  });
  assert.deepEqual(trace.read()[0], {
    photoId: "photo-a", stage: "photo_delivery_fail", timestamp: trace.read()[0].timestamp,
    durationMs: 321, httpStatus: 502, providerStatus: 401,
  });
});

test("storage and listener failures never interrupt upload", () => {
  const trace = createPhotoUploadTrace({ storage: { getItem() { throw Error(); }, setItem() { throw Error(); } }, onChange() { throw Error(); } });
  assert.doesNotThrow(() => trace.record("photo", "blob_created", { sourceBytes: 20, preparedBytes: 10, conversion: "jpeg", originalExtension: "heic" }));
  assert.equal(trace.read()[0].preparedBytes, 10);
});
