import test from "node:test";
import assert from "node:assert/strict";
import { createOperatorAiCheck } from "./operatorAiCheck.js";
import { CLOUDFLARE_ZERO_COST_MODEL } from "./cloudflareProvider.js";

const env = { AI_OPERATOR_TEST_SECRET: "a".repeat(64), AI_ZERO_COST_CONFIRMED: "true", AI_PROVIDER: "cloudflare", AI_CLOUDFLARE_MODEL: CLOUDFLARE_ZERO_COST_MODEL };
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test("operator check rejects missing/wrong credentials, unicode tokens, method and unconfirmed free configuration before access", async () => {
  for (const [method, token, configuration, expected] of [["GET", env.AI_OPERATOR_TEST_SECRET, env, 405], ["POST", "", env, 401],
    ["POST", "é".repeat(64), env, 401], ["POST", env.AI_OPERATOR_TEST_SECRET, { ...env, AI_ZERO_COST_CONFIRMED: "false" }, 503]]) {
    const res = response();
    await createOperatorAiCheck({ env: configuration, admin: () => assert.fail("must not access data") })({ method, headers: { authorization: `Bearer ${token}` } }, res);
    assert.equal(res.code, expected);
  }
});
