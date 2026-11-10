import assert from "node:assert/strict";
import { test } from "node:test";
import { createSocialHandler } from "./socialApi.js";
const request = async (req, execute = async () => ({ ok: true })) => {
  const res = { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await createSocialHandler({ service: { execute } })(req, res); return res;
};
test("profile HTTP boundary rejects method, oversized input and UID spoofing", async () => {
  assert.equal((await request({ method: "GET" })).statusCode, 405);
  assert.equal((await request({ method: "POST", body: { action: "save", uid: "other", profile: {} } })).statusCode, 400);
  assert.equal((await request({ method: "POST", body: { action: "self", padding: "x".repeat(280_000) } })).statusCode, 413);
  assert.equal((await request({ method: "POST", body: "{" })).statusCode, 400);
  assert.equal((await request({ method: "POST", body: { action: "constructor" } })).statusCode, 400);
});
test("profile boundary carries bearer only in service context and disables caching", async () => {
  const res = await request({ method: "POST", headers: { authorization: "Bearer fixture" }, body: { action: "view", identity: "user" } }, async (action, payload, token) => {
    assert.equal(token, "fixture"); assert.equal(action, "view"); assert.deepEqual(payload, { identity: "user" }); return { profile: null };
  });
  assert.equal(res.statusCode, 200); assert.match(res.headers["Cache-Control"], /no-store/);
  assert.equal((await request({ method: "POST", headers: { authorization: "spoof" }, body: { action: "self" } })).statusCode, 401);
});
test("provider errors never leak their messages, stack or credentials", async () => {
  const res = await request({ method: "POST", body: { action: "view", identity: "user" } }, async () => { throw new Error("Secret API key/provider URL"); });
  assert.deepEqual(res.body, { error: "social_unavailable" });
});
