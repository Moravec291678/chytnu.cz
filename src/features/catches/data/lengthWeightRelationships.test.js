import test from "node:test";
import assert from "node:assert/strict";
import { estimateFishWeight, formatEstimatedWeight, LENGTH_WEIGHT_RELATIONSHIPS } from "./lengthWeightRelationships.js";

test("FishBase TL coefficients estimate positive rounded kilograms for supported species", () => {
  for (const speciesId of ["commonCarp", "northernPike", "zander", "europeanPerch", "tench", "welsCatfish"]) {
    const estimate = estimateFishWeight(speciesId, 60);
    assert.ok(Number.isFinite(estimate) && estimate > 0, `${speciesId} should estimate at 60 cm`);
    assert.equal(Math.round(estimate * 100), estimate * 100);
    assert.equal(LENGTH_WEIGHT_RELATIONSHIPS[speciesId].lengthType, "TL");
    assert.equal(LENGTH_WEIGHT_RELATIONSHIPS[speciesId].lengthUnit, "cm");
    assert.equal(LENGTH_WEIGHT_RELATIONSHIPS[speciesId].weightUnit, "g");
  }
});

test("separate brown and rainbow trout relationships use distinct catalog IDs", () => {
  assert.notEqual(estimateFishWeight("brownTrout", 50), estimateFishWeight("rainbowTrout", 50));
  assert.equal(estimateFishWeight("trout", 50), null);
});

test("invalid lengths, missing species, and unsupported species never produce zero or NaN", () => {
  for (const length of [undefined, null, "", "abc", Number.NaN, Infinity, 0, -1]) {
    assert.equal(estimateFishWeight("commonCarp", length), null);
  }
  assert.equal(estimateFishWeight(undefined, 50), null);
  assert.equal(estimateFishWeight("unknownSpecies", 50), null);
  assert.equal(estimateFishWeight("commonCarp", "68,5") > 0, true);
});

test("weight display uses compact Czech decimal formatting", () => {
  assert.equal(formatEstimatedWeight(2.34), "2,34");
  assert.equal(formatEstimatedWeight(null), "");
});
