import test from "node:test";
import assert from "node:assert/strict";
import { getAuthErrorMessage, isInvalidAuthConfiguration } from "./authErrors.js";

test("auth errors map to clear Czech messages without exposing internals", () => {
  assert.match(getAuthErrorMessage({ code: "auth/invalid-email" }), /formát e-mailové adresy/);
  assert.match(getAuthErrorMessage({ code: "auth/weak-password" }), /alespoň 6 znaků/);
  assert.match(getAuthErrorMessage({ code: "auth/invalid-credential" }), /E-mail nebo heslo/);
  assert.doesNotMatch(getAuthErrorMessage({ code: "auth/unknown", message: "secret stack detail" }), /secret stack detail/);
});

test("only non-local auth configuration errors are reported as unavailable", () => {
  assert.equal(isInvalidAuthConfiguration({ code: "auth/emulator-config-required" }), true);
  assert.equal(isInvalidAuthConfiguration({ code: "auth/network-request-failed" }), false);
});
