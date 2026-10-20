import test from "node:test";
import assert from "node:assert/strict";
import { canAccessProtectedRoute } from "./routeAccess.js";

test("protected routes require an account or explicitly active guest mode", () => {
  assert.equal(canAccessProtectedRoute({ user: null, guestActive: false }), false);
  assert.equal(canAccessProtectedRoute({ user: null, guestActive: true }), true);
  assert.equal(canAccessProtectedRoute({ user: { uid: "account-1" }, guestActive: false }), true);
});
