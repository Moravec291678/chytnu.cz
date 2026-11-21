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

test("closed social modules deny reads and writes for every bearer context", async () => {
  const cases = [
    { action: "nearby.join", latitude: 50, longitude: 14 },
    { action: "nearby.consent", accepted: true },
    { action: "nearby.discover" }, { action: "nearby.status" },
    { action: "nearby.waterActivity", catalogueId: "fixture" },
    { action: "waterPresence.status" }, { action: "waterPresence.join", confirmed: true },
    { action: "waterPresence.refresh", sessionId: "fixture" },
    { action: "waterChat.list", waterId: "fixture", sessionId: "fixture" },
    { action: "waterChat.send", waterId: "fixture", sessionId: "fixture", text: "test", operationId: "fixture" },
    { action: "waterChat.report", waterId: "fixture", sessionId: "fixture", messageId: "fixture", reason: "spam" },
    { action: "dm.conversations" }, { action: "dm.send", targetUid: "fixture", text: "test", operationId: "fixture" },
    { action: "crew.list", mode: "public" }, { action: "crew.create", name: "Test", operationId: "fixture" },
    { action: "waterCommunity.list", catalogueId: "fixture" },
  ];
  for (const authorization of [undefined, "Bearer ordinary", "Bearer owner"]) {
    for (const body of cases) {
      let called = false;
      const res = await request({ method: "POST", headers: { authorization }, body }, () => { called = true; return {}; });
      assert.equal(called, false, body.action);
      assert.equal(res.statusCode, 404, body.action);
    }
  }
});
test("release closure preserves authenticated opt out and rejects unknown action names", async () => {
  for (const body of [{ action: "nearby.consent", accepted: false }, { action: "nearby.leave" }, { action: "waterPresence.leave", sessionId: "fixture" }]) {
    const res = await request({ method: "POST", headers: { authorization: "Bearer fixture" }, body }, async (action, _payload, token) => {
      assert.equal(action, body.action);
      assert.equal(token, "fixture");
      return { active: false };
    });
    assert.equal(res.statusCode, 200);
  }
  for (const action of ["crew.join", "waterChat.publish", "dm.broadcast", "waterCommunity.publish"]) {
    assert.equal((await request({ method: "POST", body: { action } })).statusCode, 400);
  }
});
