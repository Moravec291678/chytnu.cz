import test from "node:test";
import assert from "node:assert/strict";
import { resolveBackendConfiguration } from "./backendConfig.js";

test("local development defaults safely to the demo emulator", () => {
  const config = resolveBackendConfiguration({ DEV: true }, "127.0.0.1");
  assert.equal(config.mode, "emulator");
  assert.equal(config.firebase.projectId, "demo-chytnucz-local");
  assert.equal(config.googleAuthEnabled, true);
});

test("emulator mode is rejected away from a local host and never falls back to cloud", () => {
  assert.throws(() => resolveBackendConfiguration({ VITE_BACKEND_MODE: "emulator" }, "preview.example"), /pouze na tomto zařízení/);
  assert.throws(() => resolveBackendConfiguration({ DEV: false }, "preview.example"), /režim backendu/);
});

test("staging and production require a complete explicit web configuration", () => {
  assert.throws(() => resolveBackendConfiguration({ VITE_BACKEND_MODE: "staging" }, "preview.example"), /chybí Firebase konfigurace/);
  const env = {
    VITE_BACKEND_MODE: "production", VITE_FIREBASE_API_KEY: "public-key", VITE_FIREBASE_AUTH_DOMAIN: "auth.example",
    VITE_FIREBASE_PROJECT_ID: "chytnu-prod", VITE_FIREBASE_STORAGE_BUCKET: "bucket.example",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "sender", VITE_FIREBASE_APP_ID: "app", VITE_FIREBASE_GOOGLE_AUTH_ENABLED: "true",
  };
  const config = resolveBackendConfiguration(env, "chytnu.example");
  assert.equal(config.mode, "production");
  assert.equal(config.firebase.projectId, "chytnu-prod");
  assert.equal(config.googleAuthEnabled, true);
});
