import test from "node:test";
import assert from "node:assert/strict";
import { createProductionAiApplication } from "./productionApplicationApi.js";
import { CLOUDFLARE_ZERO_COST_MODEL } from "./cloudflareProvider.js";
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
const configuration = { AI_ZERO_COST_CONFIRMED: "true", AI_PROVIDER: "cloudflare", AI_CLOUDFLARE_MODEL: CLOUDFLARE_ZERO_COST_MODEL,
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "test-only-valid-configuration" };
test("production factory fails closed without independently confirmed free configuration", async () => {
  for (const env of [{}, { ...configuration, AI_ZERO_COST_CONFIRMED: "false" }, { ...configuration, AI_PROVIDER: "gemini" },
    { ...configuration, AI_CLOUDFLARE_MODEL: "paid-model" }, { ...configuration, CLOUDFLARE_API_TOKEN: "" }]) {
    const res = response();
    await createProductionAiApplication({ env })({ method: "POST", body: { action: "consent.get" } }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body.error, "ai_disabled");
  }
});
test("configured production API still requires Firebase auth and rejects removed operator actions", async () => {
  const handler = createProductionAiApplication({ env: configuration });
  const res = response();
  await handler({ method: "POST", body: { action: "species", catchId: "c", photoId: "p" } }, res);
  assert.equal(res.code, 401);
  const operator = response();
  await handler({ method: "POST", body: { action: "operator_fish_check" } }, operator);
  assert.equal(operator.code, 400);
  assert.equal(operator.body.error, "invalid_request");
});
