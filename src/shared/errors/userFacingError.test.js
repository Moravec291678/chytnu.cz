import test from "node:test";
import assert from "node:assert/strict";
import { userFacingErrorMessage } from "./userFacingError.js";

test("keeps clear domain messages for users", () => {
  assert.equal(userFacingErrorMessage(new Error("Revír se nepodařilo uložit."), "Zkus to znovu."), "Revír se nepodařilo uložit.");
});

test("hides technical SDK, browser, and network exception details", () => {
  for (const message of [
    "FirebaseError: Missing or insufficient permissions.",
    "Failed to execute 'get' on 'IDBObjectStore': The transaction is inactive.",
    "TypeError: Failed to fetch https://api.example.test/private",
    "auth/network-request-failed",
  ]) assert.equal(userFacingErrorMessage(new Error(message), "Data se nepodařilo načíst. Zkus to znovu."), "Data se nepodařilo načíst. Zkus to znovu.");
});

test("uses fallback for empty or malformed exception values", () => {
  assert.equal(userFacingErrorMessage({ message: " " }, "Něco se nepodařilo."), "Něco se nepodařilo.");
  assert.equal(userFacingErrorMessage(Object.assign(new Error("The transaction is inactive."), { name: "InvalidStateError" }), "Lokální data se nepodařilo načíst."), "Lokální data se nepodařilo načíst.");
  assert.equal(userFacingErrorMessage(null, "Něco se nepodařilo."), "Něco se nepodařilo.");
});
