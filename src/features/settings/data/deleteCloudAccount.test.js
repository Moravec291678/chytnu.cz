import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteCloudAccount } from "./deleteCloudAccount.js";

const scope = { status: "ready", ownerId: "A", scopeKey: "firebase:A" };

test("client deletes only after reauth and server acceptance, then clears scoped local data and signs out", async () => {
  const calls = [];
  const result = await deleteCloudAccount(scope, "password", {
    reauthenticate: async (password) => { calls.push(["reauth", password]); return true; },
    idToken: async (force) => { calls.push(["token", force]); return "id-token"; },
    request: async (url, options) => { calls.push(["request", url, options.method, options.headers.Authorization]); return { ok: true }; },
    clearLocal: async (value) => { calls.push(["local", value]); },
    signOut: async () => { calls.push(["signout"]); },
  });
  assert.deepEqual(result, { redirected: false, localCleanupError: false });
  assert.deepEqual(calls.map((call) => call[0]), ["reauth", "token", "request", "local", "signout"]);
  assert.equal(calls[2][3], "Bearer id-token");
  assert.equal(calls[3][1], scope);
});

test("failed server request preserves local data and session", async () => {
  await assert.rejects(() => deleteCloudAccount(scope, "", {
    reauthenticate: async () => true, idToken: async () => "token",
    request: async () => ({ ok: false, status: 503 }),
    clearLocal: async () => assert.fail("local delete must wait for server marker"),
    signOut: async () => assert.fail("session must remain"),
  }), /nepodařilo zahájit/);
});

test("Google redirect pauses deletion until user returns", async () => {
  const result = await deleteCloudAccount(scope, "", {
    reauthenticate: async () => false,
    idToken: async () => assert.fail("must pause"),
    request: async () => assert.fail("must pause"),
  });
  assert.deepEqual(result, { redirected: true });
});
