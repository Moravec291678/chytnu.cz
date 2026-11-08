import test from "node:test";
import assert from "node:assert/strict";
import { createAiOperationalDiagnostics } from "./aiOperationalDiagnostics.js";

test("operational inference counters retain only bounded aggregate fields and sanitized errors", async () => {
  let stored;
  const db = { doc: path => ({ path }), runTransaction: operation => operation({
    get: async () => ({ exists: Boolean(stored), data: () => stored }), set: (ref, value) => { assert.equal(ref.path, "adminAiDiagnostics/2026-11-08"); stored = value; },
  }) };
  const record = createAiOperationalDiagnostics({ db, now: () => Date.parse("2026-11-08T12:00:00Z") });
  assert.equal(await record({ capability: "species", status: "success", prompt: "private", uid: "private" }), true);
  assert.equal(await record({ capability: "stories", status: "error", code: "secret-token" }), true);
  assert.equal(stored.providerRequests, 2); assert.equal(stored.providerSuccesses, 1); assert.equal(stored.providerErrors, 1);
  assert.equal(stored.byCapability.species, 1); assert.equal(stored.byCapability.stories, 1);
  assert.equal(stored.lastErrorCode, "ai_unavailable");
  assert.equal(JSON.stringify(stored).includes("private"), false); assert.equal(JSON.stringify(stored).includes("secret"), false);
  assert.equal(await record({ capability: "unknown", status: "success" }), false);
  assert.equal(await createAiOperationalDiagnostics({ db: { runTransaction: async () => { throw new Error("offline"); }, doc: db.doc } })({ capability: "species", status: "success" }), false);
});
