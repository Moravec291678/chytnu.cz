import assert from "node:assert/strict";
import test from "node:test";
import { localSocialApiPlugin, restoreLocalSocialConfig } from "./local-social-api-plugin.js";

/* global process */

async function withLocalEnvironment(patch, run) {
  const values = {
    CHYTNU_LOCAL_SOCIAL_API: "1", VITE_BACKEND_MODE: "emulator",
    GCLOUD_PROJECT: "demo-chytnucz-local", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", ...patch,
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { await run(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("local API refuses non-loopback binding before loading Firebase", async () => {
  await withLocalEnvironment({}, async () => {
    await assert.rejects(() => localSocialApiPlugin().configureServer({ config: { server: { host: "0.0.0.0" } } }), /loopback/);
  });
});

test("local API refuses a non-demo Firebase project", async () => {
  await withLocalEnvironment({ GCLOUD_PROJECT: "unrelated-project" }, async () => {
    await assert.rejects(() => localSocialApiPlugin().configureServer({ config: { server: { host: "127.0.0.1" } } }), /demo Firebase/);
  });
});

test("local API refuses the production credential variable before loading Firebase", async () => {
  await withLocalEnvironment({ FIREBASE_SERVICE_ACCOUNT_JSON: "synthetic-refusal-fixture" }, async () => {
    await assert.rejects(() => localSocialApiPlugin().configureServer({ config: { server: { host: "127.0.0.1" } } }), /credentials/);
  });
});

test("local social API restores the previous emulator config", async () => {
  const calls = [];
  const previous = { enabled: false, feature: "preserved" };
  await restoreLocalSocialConfig({
    set: async value => calls.push(["set", value]),
    delete: async () => calls.push(["delete"]),
  }, { exists: true, data: () => previous });
  assert.deepEqual(calls, [["set", previous]]);
});

test("local social API removes its temporary config when none existed", async () => {
  const calls = [];
  await restoreLocalSocialConfig({
    set: async value => calls.push(["set", value]),
    delete: async () => calls.push(["delete"]),
  }, { exists: false });
  assert.deepEqual(calls, [["delete"]]);
});
