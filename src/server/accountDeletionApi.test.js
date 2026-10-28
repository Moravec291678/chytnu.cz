import assert from "node:assert/strict";
import { test } from "node:test";
import { createAccountDeletionHandler } from "./accountDeletionApi.js";

function response() {
  return { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}

test("account deletion requires verified recent identity and ignores client owner claims", async () => {
  const requested = [];
  const handler = createAccountDeletionHandler({ now: () => 1_000_000,
    verifyToken: async (token) => {
      if (token === "bad") throw new Error("bad token");
      return { uid: "ownerA", auth_time: 999 };
    },
    service: { request: async (uid) => requested.push(uid), advanceOwner: async () => ({ status: "cleanup-pending" }) },
  });
  for (const request of [
    { method: "POST", headers: {} },
    { method: "POST", headers: { authorization: "Bearer bad" } },
  ]) {
    const res = response(); await handler(request, res); assert.equal(res.statusCode, 401);
  }
  const forged = response();
  await handler({ method: "POST", headers: { authorization: "Bearer good" }, body: { uid: "ownerB" } }, forged);
  assert.equal(forged.statusCode, 400);
  const valid = response();
  await handler({ method: "POST", headers: { authorization: "Bearer good" }, body: {} }, valid);
  assert.equal(valid.statusCode, 202);
  assert.deepEqual(requested, ["ownerA"]);
});

test("account deletion rejects stale login", async () => {
  const handler = createAccountDeletionHandler({ now: () => 1_000_000,
    verifyToken: async () => ({ uid: "ownerA", auth_time: 600 }),
    service: { request: async () => assert.fail("must not delete"), advanceOwner: async () => {} },
  });
  const res = response();
  await handler({ method: "POST", headers: { authorization: "Bearer token" }, body: {} }, res);
  assert.equal(res.statusCode, 403);
});
