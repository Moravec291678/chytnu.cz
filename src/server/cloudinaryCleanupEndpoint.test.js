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
  const logs = [];
  const handler = createCleanupHandler({ getSecret: () => secret, logRun: (event) => logs.push(event), runCleanup: async () => {
    runs += 1;
    if (runs === 2) throw new Error("Sensitive synthetic provider details");
    return { scanned: 1, deleted: 0, failed: 1, account: "fixture-private-owner" };
  } });
  const request = async (method, authorization) => {
    const response = { statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
      setHeader(name, value) { this.headers[name] = value; } };
    await handler({ method, headers: { authorization } }, response);
    return response;
  };
  const wrongMethod = await request("POST", `Bearer ${secret}`);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers["Cache-Control"], "no-store");
  const unauthorized = await request("GET", "Bearer wrong");
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.headers["Cache-Control"], "no-store");
  assert.equal(runs, 0);
  assert.deepEqual(logs, []);
  const result = await request("GET", `Bearer ${secret}`);
  assert.equal(result.statusCode, 207);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(runs, 1);
  const failure = await request("GET", `Bearer ${secret}`);
  assert.equal(failure.statusCode, 503);
  assert.equal(failure.headers["Cache-Control"], "no-store");
  assert.deepEqual(logs, [
    { event: "cloud_cleanup", status: "partial_failure", deleted: 0, failed: 1 },
    { event: "cloud_cleanup", status: "unavailable" },
  ]);
});
