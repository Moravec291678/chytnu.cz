import assert from "node:assert/strict";
import test from "node:test";
import { getEntitlementState, hasVerifiedEntitlement } from "./entitlementAccess.js";

test("entitlement access fails closed without an authoritative snapshot", () => {
  assert.equal(getEntitlementState(null, "supporter"), "unavailable");
  assert.equal(hasVerifiedEntitlement(null, "supporter"), false);
  assert.equal(hasVerifiedEntitlement({ status: "active", entitlements: ["supporter"] }, "supporter"), false);
  assert.equal(hasVerifiedEntitlement({ source: "server", verified: true, status: "active", entitlements: ["supporter"] }, "supporter"), true);
});

test("expired, inactive, or unrelated server entitlements do not unlock Supporter", () => {
  const base = { source: "server", verified: true, entitlements: ["cosmetics"] };
  assert.equal(hasVerifiedEntitlement({ ...base, status: "active" }, "supporter"), false);
  assert.equal(hasVerifiedEntitlement({ ...base, status: "expired", entitlements: ["supporter"] }, "supporter"), false);
  assert.equal(getEntitlementState({ ...base, status: "inactive" }, "supporter"), "inactive");
});
