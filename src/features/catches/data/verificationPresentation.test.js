import test from "node:test";
import assert from "node:assert/strict";
import { getVerificationPresentation } from "./verificationPresentation.js";

test("strong and standard use the friendly verified label", () => {
  assert.equal(getVerificationPresentation({ level: "strong" }).label, "Ověřený úlovek");
  assert.equal(getVerificationPresentation({ level: "standard" }).label, "Ověřený úlovek");
});

test("limited verification explains missing context without exposing reason codes", () => {
  const copy = getVerificationPresentation({ level: "limited", reason: "missing-trip-or-water-location" });
  assert.equal(copy.label, "Částečně ověřeno");
  assert.match(copy.message, /údajů o místě nebo čase/);
  assert.doesNotMatch(copy.message, /missing-trip/);
});

test("unverified and legacy records use calm user-facing copy", () => {
  assert.equal(getVerificationPresentation({ level: "unverified", reason: "missing-photo" }).label, "Úlovek uložen bez ověření");
  assert.equal(getVerificationPresentation({ status: "verified", reason: "legacy-code" }).label, "Ověřený úlovek");
});
