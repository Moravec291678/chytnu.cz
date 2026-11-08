import test from "node:test";
import assert from "node:assert/strict";
import { resolveAccess, normalizeRuntimeConfig, hasAdminPermission, effectiveUserReservation, isRuntimeFeatureEnabled } from "./adminPolicy.js";

test("OWNER is provisioned by exact trusted UID only; stored OWNER/email/name do not promote users", () => {
  assert.equal(resolveAccess("david", { role: "OWNER", email: "owner@example.test" }, "").role, "USER");
  const owner = resolveAccess("trusted-uid", {}, "trusted-uid");
  assert.equal(owner.role, "OWNER"); assert.equal(hasAdminPermission(owner, "users.manage"), true);
  assert.equal(effectiveUserReservation(owner, normalizeRuntimeConfig()), null);
  assert.equal(resolveAccess("different", { displayName: "OWNER" }, "trusted-uid").role, "USER");
});
test("delegated admin permissions do not turn testers into administrators and suspension always denies", () => {
  assert.equal(hasAdminPermission(resolveAccess("admin", { role: "ADMIN", permissions: ["tasks"] }), "tasks"), true);
  assert.equal(hasAdminPermission(resolveAccess("admin", { role: "ADMIN", permissions: ["tasks"] }), "users.manage"), false);
  assert.equal(hasAdminPermission(resolveAccess("tester", { role: "TESTER" }), "tasks"), false);
  assert.equal(hasAdminPermission(resolveAccess("owner", { suspended: true }, "owner"), "tasks"), false);
  assert.throws(() => resolveAccess("a", { role: "ADMIN", permissions: ["*"] }));
});
test("strict limits cannot enable paid capacity and temporary individual overrides expire", () => {
  const config = normalizeRuntimeConfig({ limits: { userDailyReservation: 2500 } });
  assert.equal(effectiveUserReservation(resolveAccess("user", { limits: { dailyReservation: 350 }, overrideExpiresAt: "2026-11-09T00:00:00Z" }, "", Date.parse("2026-11-08T12:00:00Z")), config), 350);
  assert.equal(effectiveUserReservation(resolveAccess("user", { limits: { dailyReservation: 350 }, overrideExpiresAt: "2026-11-07T00:00:00Z" }, "", Date.parse("2026-11-08T12:00:00Z")), config), 2500);
  for (const limits of [{globalDailyReservation:7501},{textDailyReservation:1001},{userDailyReservation:-1},{testerDailyReservation:Infinity},{requestReservation:1}]) assert.throws(()=>normalizeRuntimeConfig({limits}));
});
test("feature audiences, owner-only and disabled controls apply before individual exceptions", () => {
  const user = resolveAccess("user", {entitlements:{species:true}}), tester=resolveAccess("tester",{role:"TESTER"}), owner=resolveAccess("owner",{},"owner");
  const config = audience => normalizeRuntimeConfig({features:{species:{audience,userIds:[]}}});
  assert.equal(isRuntimeFeatureEnabled("species",user,config("owner")),false);
  assert.equal(isRuntimeFeatureEnabled("species",owner,config("disabled")),false);
  assert.equal(isRuntimeFeatureEnabled("species",tester,config("testers")),true);
  assert.equal(isRuntimeFeatureEnabled("species",resolveAccess("user"),config("testers")),false);
  assert.equal(isRuntimeFeatureEnabled("species",user,config("selected")),true);
  assert.throws(()=>normalizeRuntimeConfig({features:{unrelated:{audience:"everyone"}}}));
});


test("CO_CREATOR requires a trusted UID and has only tasks/monitoring, quota exemption and eligible features", () => {
  const co = resolveAccess("co", { role: "ADMIN", permissions: ["users.manage", "audit"] }, "owner", Date.now(), "co");
  assert.equal(co.role, "CO_CREATOR");
  assert.deepEqual(co.permissions, ["tasks", "monitoring"]);
  assert.equal(co.internalLimitExempt, true);
  assert.equal(hasAdminPermission(co, "tasks"), true);
  for (const permission of ["users.manage", "users.read", "audit", "owner"]) assert.equal(hasAdminPermission(co, permission), false);
  assert.equal(resolveAccess("impostor", { role: "CO_CREATOR" }, "owner", Date.now(), "co").role, "USER");
  const runtime = normalizeRuntimeConfig({ features: { species: { audience: "testers" } } });
  assert.equal(isRuntimeFeatureEnabled("species", co, runtime), true);
  assert.equal(effectiveUserReservation(co, runtime), null);
  runtime.features.species.audience = "disabled";
  assert.equal(isRuntimeFeatureEnabled("species", co, runtime), false);
});
