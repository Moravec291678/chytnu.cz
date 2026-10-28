import assert from "node:assert/strict";
import test from "node:test";
import { createCleanupHandler, validCronAuthorization } from "../../api/cloudinary/cleanup.js";

test("photo cleanup cron requires a configured secret and exact bearer value", () => {
  assert.equal(validCronAuthorization("Bearer a-very-long-test-secret", "a-very-long-test-secret"), true);
  assert.equal(validCronAuthorization("Bearer a-very-long-test-secret ", "a-very-long-test-secret"), false);
  assert.equal(validCronAuthorization("Bearer short", "short"), false);
  assert.equal(validCronAuthorization(null, "a-very-long-test-secret"), false);
  assert.equal(validCronAuthorization("Bearer a-very-long-test-secret", undefined), false);
});

test("protected maintenance endpoint runs only for the scheduler and reports retryable failures", async () => {
  const secret = "a-very-long-test-secret";
  let runs = 0;
  const handler = createCleanupHandler({ getSecret: () => secret, runCleanup: async () => {
    runs += 1;
    return { scanned: 1, deleted: 0, failed: 1 };
  } });
  const request = async (method, authorization) => {
    const response = { statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
      setHeader(name, value) { this.headers[name] = value; } };
    await handler({ method, headers: { authorization } }, response);
    return response;
  };
  assert.equal((await request("POST", `Bearer ${secret}`)).statusCode, 405);
  assert.equal((await request("GET", "Bearer wrong")).statusCode, 401);
  assert.equal(runs, 0);
  const result = await request("GET", `Bearer ${secret}`);
  assert.equal(result.statusCode, 207);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(runs, 1);
});
