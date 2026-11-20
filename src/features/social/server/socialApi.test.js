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

test("closed location modules deny reads and new presence for every bearer context", async () => {
  const cases = [
    { action: "nearby.join", latitude: 50, longitude: 14 },
    { action: "nearby.consent", accepted: true },
    { action: "nearby.discover" }, { action: "nearby.status" },
    { action: "nearby.waterActivity", catalogueId: "fixture" },
    { action: "waterPresence.status" }, { action: "waterPresence.join", confirmed: true },
    { action: "waterPresence.refresh", sessionId: "fixture" },
  ];
  for (const authorization of [undefined, "Bearer ordinary", "Bearer owner"]) {
    for (const body of cases) {
      const res = await request({ method: "POST", headers: { authorization }, body }, () => assert.fail("disabled action reached service"));
      assert.equal(res.statusCode, 404, body.action);
    }
  }
});
test("release closure preserves authenticated opt out and denies unfinished API namespaces", async () => {
  for (const body of [{ action: "nearby.consent", accepted: false }, { action: "nearby.leave" }, { action: "waterPresence.leave", sessionId: "fixture" }]) {
    const res = await request({ method: "POST", headers: { authorization: "Bearer fixture" }, body }, async (action, _payload, token) => {
      assert.equal(action, body.action);
      assert.equal(token, "fixture");
      return { active: false };
    });
    assert.equal(res.statusCode, 200);
  }
  for (const action of ["crew.join", "waterChat.send", "dm.send"]) {
    assert.equal((await request({ method: "POST", body: { action } })).statusCode, 400);
  }
});
