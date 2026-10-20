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
