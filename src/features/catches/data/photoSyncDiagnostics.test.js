import assert from "node:assert/strict";
import test from "node:test";
import { readPhotoSyncDiagnostics } from "./photoSyncDiagnostics.js";

test("photo diagnostics expose only safe per-photo state and sanitize error classes", async () => {
  const result = await readPhotoSyncDiagnostics({
    scope: { ownerId: "private-user-id", scopeKey: "account:private-user-id" },
    catches: { async list() { return [{ id: "private-catch", photos: [
      { id: "private-photo", blob: new Blob(["photo"], { type: "image/jpeg" }), cloud: { state: "uploadFailed" } },
    ] }]; } },
    queue: { async list() { return [{
      scopeKey: "account:private-user-id", status: "failed", attemptCount: 2,
      lastError: "secret message", lastErrorCode: "photo_upload_network_error", nextAttemptAt: "later",
      photoCloud: { catchId: "private-catch", photoId: "private-photo" },
    }]; } },
  });
  assert.deepEqual(result, [{ blobPresent: true, size: 5, type: "image/jpeg", jobState: "failed", attempts: 2,
    localBlobReadable: true, nextRetryAt: "later", errorClass: "photo_upload_network_error", errorName: null, errorStage: null,
    cloudState: "uploadFailed", remoteAvailability: "unknown" }]);
  assert.doesNotMatch(JSON.stringify(result), /private-user-id|private-catch|private-photo|secret message/);
});

test("photo diagnostics classify a Safari Blob read failure without recording its message", async () => {
  const broken = new (class extends Blob {
    async arrayBuffer() { throw new DOMException("The object can not be found here.", "NotFoundError"); }
  })(["unreadable"], { type: "image/jpeg" });
  const [photo] = await readPhotoSyncDiagnostics({
    scope: { ownerId: "owner", scopeKey: "account:owner" },
    catches: { async list() { return [{ id: "catch", photos: [{ id: "photo", blob: broken }] }]; } },
    queue: { async list() { return []; } },
  });
  assert.equal(photo.localBlobReadable, false);
  assert.equal(photo.errorName, "NotFoundError");
  assert.equal(photo.errorStage, "photo-diagnostics-read-local-blob");
  assert.equal(photo.errorClass, "photo_local_blob_unreadable");
  assert.doesNotMatch(JSON.stringify(photo), /The object can not be found here|account:owner|"owner"|"catch"|"photo"/);
});

test("photo diagnostics do not include jobs from another account scope", async () => {
  const result = await readPhotoSyncDiagnostics({
    scope: { ownerId: "account-b", scopeKey: "account:account-b" },
    catches: { async list() { return [{ id: "c", photos: [{ id: "p", type: "image/jpeg" }] }]; } },
    queue: { async list() { return [{ scopeKey: "account:account-a", status: "failed", photoCloud: { catchId: "c", photoId: "p" } }]; } },
  });
  assert.equal(result[0].jobState, "no_job");
});
