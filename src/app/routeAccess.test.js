import test from "node:test";
import assert from "node:assert/strict";
import { canAccessProtectedRoute, isPublicRoute, resolveAuthenticatedRedirect } from "./routeAccess.js";

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

test("legal information pages are public while privacy settings remain protected", () => {
  assert.equal(isPublicRoute("/privacy-policy"), true);
  assert.equal(isPublicRoute("/terms"), true);
  assert.equal(isPublicRoute("/privacy"), false);
  assert.equal(isPublicRoute("/settings"), false);
});
