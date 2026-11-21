import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { FEATURES, isFeatureEnabled } from "./featureFlags.js";

test("future social, challenge and monetization UI stays disabled without real features", () => {
  assert.ok(Object.entries(FEATURES).every(([key, enabled]) => enabled === ["publicProfiles", "userDiscovery", "friends", "publicSharing", "community"].includes(key)));
  assert.equal(isFeatureEnabled("publicProfiles"), true);
  assert.equal(isFeatureEnabled("friends"), true);
  assert.equal(isFeatureEnabled("community"), true);
  assert.equal(isFeatureEnabled("nearby"), false);
  assert.equal(isFeatureEnabled("waterPresence"), false);
  assert.equal(isFeatureEnabled("waterChat"), false);
  assert.equal(isFeatureEnabled("publicSharing"), true);
  assert.equal(Object.hasOwn(FEATURES, "aiInsights"), false);
  assert.equal(Object.hasOwn(FEATURES, "dailyTips"), false);
  assert.equal(isFeatureEnabled("seasonalChallenges"), false);
  assert.equal(isFeatureEnabled("unknown-feature"), false);
});

test("private journal pilot closes sharing and external AI on both the app and server", () => {
  const code = `
    import assert from "node:assert/strict";
    import { FEATURES } from "./src/product/config/featureFlags.js";
    import { AI_FEATURES } from "./src/features/ai/aiPolicy.js";
    import account from "./api/account/delete.js";
    import { createSocialHandler } from "./src/features/social/server/socialApi.js";
    assert.ok(Object.values(FEATURES).every(value => value === false));
    assert.ok(Object.values(AI_FEATURES).every(value => value === false));
    const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json() {} });
    const social = createSocialHandler({ service: { execute() { assert.fail("closed pilot"); } } });
    for (const action of ["view", "posts.image", "posts.publishNew", "relationship", "nearby.join", "dm.send", "crew.create"]) {
      const res = response();
      await social({ method: "POST", headers: { authorization: "Bearer fixture" }, body: { action } }, res);
      assert.equal(res.code, 404);
    }
    const res = response();
    await account({ method: "POST", query: { social: "1" } }, res);
    assert.equal(res.code, 404);
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: new URL("../../../", import.meta.url),
    env: { ...process.env, VITE_PRIVATE_JOURNAL_PILOT: "1" },
  });
});
