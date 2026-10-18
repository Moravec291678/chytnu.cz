import test from "node:test";
import assert from "node:assert/strict";
import { validateAuthForm } from "./authFormValidation.js";

test("auth form explains empty, invalid and short credentials", () => {
  assert.equal(validateAuthForm({ email: "", password: "" }), "Zadej e-mail.");
  assert.equal(validateAuthForm({ email: "rybar", password: "heslo12" }), "Zadej platnou e-mailovou adresu.");
  assert.equal(validateAuthForm({ email: "rybar@example.test", password: "" }), "Zadej heslo.");
  assert.equal(validateAuthForm({ email: "rybar@example.test", password: "12345" }), "Heslo musí mít alespoň 6 znaků.");
  assert.equal(validateAuthForm({ email: " rybar@example.test ", password: "heslo12" }), "");
});

test("password reset validates only the email", () => {
  assert.equal(validateAuthForm({ email: "rybar@example.test", requirePassword: false }), "");
  assert.equal(validateAuthForm({ email: "spatne", requirePassword: false }), "Zadej platnou e-mailovou adresu.");
});
