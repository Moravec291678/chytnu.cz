import assert from "node:assert/strict";
import test from "node:test";
import { FEATURES } from "../../../product/config/featureFlags.js";
import {
  canAddCatchPhoto,
  canUse,
  createEntitlementEngine,
  getCatchPhotoAdditionLimit,
  getCatchPhotoPreservationLimit,
  getEntitlementState,
  hasVerifiedEntitlement,
} from "./entitlementAccess.js";

const now = Date.parse("2026-10-28T12:00:00.000Z");
const serverSnapshot = (status, extra = {}) => ({
  source: "server",
  verified: true,
  status,
  entitlements: ["supporter"],
  ...extra,
});

test("entitlement access fails closed without a server-verified snapshot", () => {
  assert.equal(getEntitlementState(null, "supporter", { now }), "unavailable");
  assert.equal(hasVerifiedEntitlement(null, "supporter", { now }), false);
  assert.equal(canUse("stats.advanced", null, { now, featureFlags: { supporter: true } }), false);
  assert.equal(hasVerifiedEntitlement({ status: "active", entitlements: ["supporter"] }, "supporter", { now }), false);
});

test("active and grace entitlements are time-limited and cancelled or expired do not grant access", () => {
  const active = serverSnapshot("active", { expiresAt: new Date(now + 60_000).toISOString() });
  const grace = serverSnapshot("grace", { expiresAt: new Date(now - 60_000).toISOString(), graceUntil: new Date(now + 60_000).toISOString() });
  assert.equal(getEntitlementState(active, "supporter", { now }), "active");
  assert.equal(hasVerifiedEntitlement(active, "supporter", { now }), true);
  const endedActive = serverSnapshot("active", { expiresAt: new Date(now).toISOString() });
  assert.equal(getEntitlementState(endedActive, "supporter", { now }), "expired");
  assert.equal(hasVerifiedEntitlement(endedActive, "supporter", { now }), false);
  assert.equal(getEntitlementState(grace, "supporter", { now }), "grace");
  assert.equal(hasVerifiedEntitlement(grace, "supporter", { now }), true);
  assert.equal(hasVerifiedEntitlement(serverSnapshot("grace", { graceUntil: new Date(now).toISOString() }), "supporter", { now }), false);
  assert.equal(getEntitlementState(serverSnapshot("expired"), "supporter", { now }), "expired");
  assert.equal(hasVerifiedEntitlement(serverSnapshot("expired"), "supporter", { now }), false);
  assert.equal(getEntitlementState(serverSnapshot("cancelled"), "supporter", { now }), "cancelled");
  assert.equal(hasVerifiedEntitlement(serverSnapshot("cancelled"), "supporter", { now }), false);
  assert.equal(hasVerifiedEntitlement(serverSnapshot("active", { expiresAt: "not-a-date" }), "supporter", { now }), false);
});

test("canUse requires the global Supporter flag and a matching verified entitlement", () => {
  const active = serverSnapshot("active");
  assert.equal(FEATURES.supporter, false);
  assert.equal(canUse("stats.advanced", active, { now }), false);
  assert.equal(canUse("unknown.capability", active, { now, featureFlags: { supporter: true } }), false);
  assert.equal(canUse("stats.advanced", active, { now, featureFlags: { supporter: true } }), true);
  assert.equal(canUse("stats.advanced", serverSnapshot("active", { entitlements: ["other"] }), { now, featureFlags: { supporter: true } }), false);
  const engine = createEntitlementEngine({ snapshot: active, now, featureFlags: { supporter: true } });
  assert.equal(engine.canUse("stats.advanced"), true);
  assert.equal(engine.canUse("filters.saved"), true);
});

test("Free catch-photo limit stays four, while verified entitlement can expose the future limit", () => {
  const active = serverSnapshot("active");
  const options = { now, featureFlags: { supporter: true } };
  assert.equal(getCatchPhotoAdditionLimit(null, { now }), 4);
  assert.equal(getCatchPhotoAdditionLimit(active, { now }), 4, "default-off Supporter flag keeps the product limit unchanged");
  assert.equal(getCatchPhotoAdditionLimit(active, options), 8);
  assert.equal(canAddCatchPhoto(active, 7, options), true);
  assert.equal(canAddCatchPhoto(active, 8, options), false);
});

test("expiration preserves existing photos but blocks additions above the Free limit", () => {
  const photos = Array.from({ length: 8 }, (_, index) => ({ id: `photo-${index}` }));
  const expired = serverSnapshot("expired");
  assert.equal(getCatchPhotoPreservationLimit(expired, photos.length, { now }), 8, "existing records remain readable/editable without truncation");
  assert.equal(getCatchPhotoAdditionLimit(expired, { now }), 4);
  assert.equal(canAddCatchPhoto(expired, photos.length, { now }), false);
  assert.equal(photos.length, 8, "policy evaluation does not mutate or delete stored photos");
  assert.deepEqual(photos.map(({ id }) => id), Array.from({ length: 8 }, (_, index) => `photo-${index}`));
});
