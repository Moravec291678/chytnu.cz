import test from "node:test";
import assert from "node:assert/strict";
import { getCatchRecordStatus } from "./catchReward.js";

test("record status compares real catches and excludes estimated weights", () => {
  const catchRecord = { id: "new", speciesKey: "carp", weightKg: 6, weightSource: "manual" };
  const catches = [
    { id: "old", speciesKey: "carp", weightKg: 5, weightSource: "manual" },
    { id: "estimate", speciesKey: "pike", weightKg: 30, weightSource: "estimated" },
  ];
  assert.deepEqual(getCatchRecordStatus(catchRecord, catches), { personalRecord: true, speciesRecord: true });
  assert.deepEqual(getCatchRecordStatus({ ...catchRecord, weightSource: "estimated" }, catches), { personalRecord: false, speciesRecord: false });
  assert.deepEqual(getCatchRecordStatus({ ...catchRecord, id: "smaller", weightKg: 4 }, catches), { personalRecord: false, speciesRecord: false });
  assert.deepEqual(
    getCatchRecordStatus({ id: "legacy-new", species: "Kapr", weightKg: 4, weightSource: "manual" }, [
      { id: "legacy-old", species: "Kapr", weightKg: 5, weightSource: "manual" },
      { id: "legacy-other", species: "Štika", weightKg: 3, weightSource: "manual" },
    ]),
    { personalRecord: false, speciesRecord: false },
  );
});

test("a future-dated Catch cannot earn personal or species record recognition", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");
  const future = { id: "future", speciesKey: "carp", caughtAt: "2026-10-29T10:00:00.000Z", weightKg: 100, weightSource: "manual" };
  const current = { id: "current", speciesKey: "carp", caughtAt: "2026-10-28T10:00:00.000Z", weightKg: 5, weightSource: "manual" };
  assert.deepEqual(getCatchRecordStatus(future, [current, future], now), { personalRecord: false, speciesRecord: false });
  assert.deepEqual(getCatchRecordStatus(current, [current, future], now), { personalRecord: true, speciesRecord: true });
});

test("record comparison prioritizes length and uses measured weight only as a tie-break", () => {
  const candidate = { id: "long", speciesKey: "pike", lengthCm: 100, caughtAt: "2026-10-27T10:00:00Z" };
  const history = [{ id: "heavy", speciesKey: "pike", lengthCm: 90, weightKg: 10, weightSource: "manual", caughtAt: "2026-10-26T10:00:00Z" }];
  assert.deepEqual(getCatchRecordStatus(candidate, history), { personalRecord: true, speciesRecord: true });
  const tie = { ...candidate, lengthCm: 100, weightKg: 9, weightSource: "manual" };
  assert.deepEqual(getCatchRecordStatus(tie, [{ ...candidate, id: "tie", weightKg: 8, weightSource: "manual" }]), { personalRecord: true, speciesRecord: true });
  assert.deepEqual(getCatchRecordStatus({ ...tie, weightKg: 8 }, [{ ...candidate, id: "tie", weightKg: 9, weightSource: "manual" }]), { personalRecord: false, speciesRecord: false });
});
