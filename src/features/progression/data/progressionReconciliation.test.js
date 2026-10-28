import test from "node:test";
import assert from "node:assert/strict";
import { reconcileProgressionTotals } from "./progressionReconciliation.js";

test("legacy baseline never decreases and confirmed server rewards are added once", () => {
  const first = reconcileProgressionTotals({ localProgressionXp: 120 });
  assert.equal(first.legacyBaselineXp, 120);
  assert.equal(first.serverTotalXp, 120);

  const confirmed = reconcileProgressionTotals({ legacyBaselineXp: first.legacyBaselineXp, serverEventXp: 15, localProgressionXp: 135 });
  assert.equal(confirmed.legacyBaselineXp, 120);
  assert.equal(confirmed.serverTotalXp, 135);

  const replay = reconcileProgressionTotals({ ...confirmed, localProgressionXp: 135 });
  assert.deepEqual(replay, confirmed);
  const lowerDevice = reconcileProgressionTotals({ legacyBaselineXp: 120, serverEventXp: 15, localProgressionXp: 120 });
  assert.equal(lowerDevice.displayedXp, 135);
});

test("new pending local Catch XP is excluded from baseline until its server claim arrives", () => {
  const pending = reconcileProgressionTotals({
    legacyBaselineXp: 90, serverEventXp: 10, localProgressionXp: 125, pendingCatchXp: 25,
  });
  assert.equal(pending.legacyBaselineXp, 90);
  assert.equal(pending.serverTotalXp, 100);
  assert.equal(pending.displayedXp, 100, "online display follows only the confirmed server ledger");

  const claimed = reconcileProgressionTotals({
    legacyBaselineXp: pending.legacyBaselineXp, serverEventXp: 35, localProgressionXp: 125,
  });
  assert.equal(claimed.serverTotalXp, 125);
});

test("later device with a higher legacy record raises the shared baseline without reducing XP", () => {
  const firstDevice = reconcileProgressionTotals({ localProgressionXp: 80 });
  const otherDevice = reconcileProgressionTotals({
    legacyBaselineXp: firstDevice.legacyBaselineXp, serverEventXp: 20, localProgressionXp: 130,
  });
  assert.equal(otherDevice.legacyBaselineXp, 110);
  assert.equal(otherDevice.serverTotalXp, 130);
  const firstDeviceAfterSync = reconcileProgressionTotals({
    legacyBaselineXp: otherDevice.legacyBaselineXp, serverEventXp: 20, localProgressionXp: 100,
  });
  assert.equal(firstDeviceAfterSync.displayedXp, 130);
});

test("invalid and negative client baseline values cannot reduce the stored baseline", () => {
  const result = reconcileProgressionTotals({
    legacyBaselineXp: 500, serverEventXp: 40, localProgressionXp: -10, pendingCatchXp: 1000,
  });
  assert.equal(result.legacyBaselineXp, 500);
  assert.equal(result.serverTotalXp, 540);
});
