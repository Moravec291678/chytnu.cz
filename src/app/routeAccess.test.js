import { readFile } from "node:fs/promises";
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

test("public fishing profile routes allow anonymous access without opening profile settings", () => {
  assert.equal(isPublicRoute("/u/firebase-uid"), true);
  assert.equal(isPublicRoute("/u/@rybar_1"), true);
  assert.equal(isPublicRoute("/u/firebase-uid/"), true);
  assert.equal(isPublicRoute("/u/firebase-uid/settings"), false);
  assert.equal(isPublicRoute("/profile/social"), false);
});

test("public post permalink does not open community settings or private catch routes",()=>{
  assert.equal(isPublicRoute(`/community/post/${"a".repeat(64)}`),true);
  assert.equal(isPublicRoute("/community"),false);
  assert.equal(isPublicRoute(`/community/post/${"a".repeat(64)}/edit`),false);
  assert.equal(isPublicRoute("/community/catch/private-catch"),false);
});

test("closed social routes fail at the router as well as outside a session", async () => {
  const router = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  for (const [path, flag] of [["/crew", "crew"], ["/nearby", "nearby"], ["/waters/:waterId/chat", "waterChat"]]) {
    assert.equal(isPublicRoute(path.replace(":waterId", "fixture")), false, path);
    const registration = router.split("\n").find(line => line.includes('path="' + path + '"'));
    assert.ok(registration?.includes('isFeatureEnabled("' + flag + '")') && registration.includes(": <NotFoundPage />"), path);
  }
});
