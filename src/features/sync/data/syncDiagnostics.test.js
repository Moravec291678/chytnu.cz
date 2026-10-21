import test from "node:test";
import assert from "node:assert/strict";
import { describeSyncFailure } from "./syncDiagnostics.js";
import { normalizeFirebaseError } from "./firestoreSyncAdapter.js";

test("sync diagnostics distinguish permission and connectivity without leaking provider messages", () => {
  const denied = describeSyncFailure({ code: "permission_denied", message: "secret backend detail", providerCode: "firestore/permission-denied" }, { entityType: "catch", operation: "upsert" });
  assert.equal(denied.entityType, "catch");
  assert.equal(denied.operation, "upsert");
  assert.equal(denied.code, "permission_denied");
  assert.equal(denied.providerCode, "firestore/permission-denied");
  assert.match(denied.message, /nebyla povolena serverem/);
  assert.doesNotMatch(denied.message, /secret backend detail/);

  const offline = describeSyncFailure({ code: "unavailable", retryable: true });
  assert.equal(offline.retryable, true);
  assert.match(offline.message, /není dostupný/);
});

test("unknown sync failures remain safe and keep useful operation context", () => {
  const failure = describeSyncFailure({ code: "vendor/private", message: "token=secret" }, { entityType: "water", operation: "delete" });
  assert.deepEqual({ code: failure.code, entityType: failure.entityType, operation: failure.operation }, { code: "unknown", entityType: "water", operation: "delete" });
  assert.doesNotMatch(failure.message, /token|secret/);
});

test("sync diagnostics distinguish auth, rules, network, and Cloudinary failures", () => {
  assert.equal(describeSyncFailure({ code: "unauthenticated" }).code, "unauthenticated");
  assert.equal(describeSyncFailure({ code: "firestore/invalid-argument" }).code, "rules_schema_rejection");
  assert.equal(describeSyncFailure({ code: "photo_cloud_network_error" }).code, "network");
  assert.equal(describeSyncFailure({ code: "cloudinary_signing_failed" }).code, "cloudinary_signing_failure");
  assert.equal(describeSyncFailure({ code: "cloudinary_download_failed" }).code, "remote_delivery_failure");
  assert.equal(describeSyncFailure({ code: "invalid_auth" }).code, "firebase_token_invalid");
  assert.equal(describeSyncFailure({ code: "firebase_token_expired" }).code, "firebase_token_expired");
  assert.equal(describeSyncFailure({ code: "token_refresh_failed" }).code, "token_refresh_failed");
  assert.equal(describeSyncFailure({ code: "firebase_admin_config_invalid" }).code, "firebase_admin_config_invalid");
  assert.equal(describeSyncFailure({ code: "firebase_project_mismatch" }).code, "firebase_project_mismatch");
  assert.equal(describeSyncFailure({ code: "photo_not_owned" }).code, "ownership_denied");
});

test("Firestore transient provider codes are preserved and retryable while permission failures are terminal", () => {
  for (const code of ["unavailable", "deadline-exceeded", "aborted", "internal", "resource-exhausted", "network-request-failed"]) {
    const normalized = normalizeFirebaseError(Object.assign(new Error("private details"), { name: "FirebaseError", code: `firestore/${code}` }));
    const failure = describeSyncFailure(normalized);
    assert.equal(failure.retryable, true, code);
    assert.equal(failure.providerCode, `firestore/${code}`);
    assert.equal(failure.errorName, "FirebaseError");
  }
  const denied = describeSyncFailure(normalizeFirebaseError(Object.assign(new Error("sensitive"), {
    name: "FirebaseError", code: "firestore/permission-denied",
  })), { entityType: "catch", operation: "pull" });
  assert.equal(denied.code, "permission_denied");
  assert.equal(denied.retryable, false);
  assert.equal(denied.providerCode, "firestore/permission-denied");
});

test("provider errors without a recognized code stay retryable and expose only safe diagnostic fields", () => {
  const raw = Object.assign(new Error("token=must-not-leak"), { name: "FirebaseError", privateData: "secret" });
  const failure = describeSyncFailure(normalizeFirebaseError(raw), { entityType: "catch", operation: "pull" });
  assert.equal(failure.code, "unknown");
  assert.equal(failure.retryable, true);
  assert.equal(failure.providerCode, null);
  assert.equal(failure.errorName, "FirebaseError");
  assert.doesNotMatch(JSON.stringify(failure), /token|must-not-leak|secret/);
});
