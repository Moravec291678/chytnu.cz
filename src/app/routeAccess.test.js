import test from "node:test";
import assert from "node:assert/strict";
import { canAccessProtectedRoute, resolveAuthenticatedRedirect } from "./routeAccess.js";

test("protected routes require an account or explicitly active guest mode", () => {
  assert.equal(canAccessProtectedRoute({ user: null, guestActive: false }), false);
  assert.equal(canAccessProtectedRoute({ user: null, guestActive: true }), true);
  assert.equal(canAccessProtectedRoute({ user: { uid: "account-1" }, guestActive: false }), true);
});

test("authenticated auth state takes priority over login and guest entry", () => {
  assert.equal(resolveAuthenticatedRedirect({ status: "loading", user: { uid: "account-1" } }), null);
  assert.equal(resolveAuthenticatedRedirect({ status: "ready", user: { uid: "account-1" } }), "/");
  assert.equal(resolveAuthenticatedRedirect({ status: "ready", user: null }), null);
});
