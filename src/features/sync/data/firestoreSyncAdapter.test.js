import assert from "node:assert/strict";
import test from "node:test";
import { toRemoteRecord } from "./firestoreSyncAdapter.js";

test("Firestore catch projection preserves supported stored conditions only", () => {
  const record = {
    id: "catch-1",
    ownerId: "angler-1",
    conditions: {
      airTempC: -3.5,
      waterTempC: 4,
      pressureHpa: 1018,
      windKmh: 9.5,
      moonPhase: "waxingCrescent",
      weather: "polojasno",
      internalOnly: "not a catch condition",
    },
    conditionSources: { airTempC: "auto", pressureHpa: "manual", unknown: "auto" },
  };

  assert.deepEqual(
    toRemoteRecord("catch", record, "angler-1").conditions,
    {
      airTempC: -3.5,
      waterTempC: 4,
      pressureHpa: 1018,
      windKmh: 9.5,
      moonPhase: "waxingCrescent",
      weather: "polojasno",
    },
  );
  assert.deepEqual(toRemoteRecord("catch", record, "angler-1").conditionSources, { airTempC: "auto", pressureHpa: "manual" });
});

test("Firestore catch projection writes null when conditions were not recorded", () => {
  const record = { id: "catch-2", ownerId: "angler-1" };

  assert.equal(toRemoteRecord("catch", record, "angler-1").conditions, null);
  assert.equal(toRemoteRecord("catch", record, "angler-1").conditionSources, null);
});
