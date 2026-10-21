import test from "node:test";
import assert from "node:assert/strict";
import { initializeBrowserAuth, runGoogleSignIn } from "./firebaseAuth.js";

function authApi(overrides = {}) {
  class GoogleAuthProvider {}
  return {
    GoogleAuthProvider,
    signInWithPopup: async () => ({ user: { uid: "google-user" } }),
    signInWithRedirect: async () => undefined,
    ...overrides,
  };
}

test("browser Auth initialization includes the resolver required by Google popup and redirect", () => {
  const app = {};
  const persistence = {};
  const resolver = {};
  let receivedOptions = null;
  const initialized = {};
  const api = {
    browserLocalPersistence: persistence,
    browserPopupRedirectResolver: resolver,
    initializeAuth(receivedApp, options) {
      assert.equal(receivedApp, app);
      receivedOptions = options;
      return initialized;
    },
  };

  assert.equal(initializeBrowserAuth(app, api), initialized);
  assert.deepEqual(receivedOptions, {
    persistence,
    popupRedirectResolver: resolver,
  });
});

test("Google popup returns the authenticated Firebase user", async () => {
  const auth = {};
  assert.deepEqual(await runGoogleSignIn(auth, authApi()), { uid: "google-user" });
});

test("a browser-blocked popup falls back to Firebase redirect on the same Auth instance", async () => {
  const auth = {};
  let redirectedAuth = null;
  const api = authApi({
    signInWithPopup: async () => { throw Object.assign(new Error("blocked"), { code: "auth/popup-blocked" }); },
    signInWithRedirect: async (receivedAuth) => { redirectedAuth = receivedAuth; },
  });
  assert.equal(await runGoogleSignIn(auth, api), null);
  assert.equal(redirectedAuth, auth);
});

test("Google errors other than popup blocking are preserved for the UI", async () => {
  const failure = Object.assign(new Error("domain"), { code: "auth/unauthorized-domain" });
  let redirected = false;
  const api = authApi({
    signInWithPopup: async () => { throw failure; },
    signInWithRedirect: async () => { redirected = true; },
  });
  await assert.rejects(() => runGoogleSignIn({}, api), (error) => error === failure);
  assert.equal(redirected, false);
});
