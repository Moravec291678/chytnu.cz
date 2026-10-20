import test from "node:test";
import assert from "node:assert/strict";
import { estimateFishWeight, formatEstimatedWeight, LENGTH_WEIGHT_RELATIONSHIPS, SPECIES_WITHOUT_LENGTH_WEIGHT_RELATIONSHIP } from "./lengthWeightRelationships.js";
import { DEFAULT_SPECIES } from "../../../shared/constants/speciesCatalog.js";

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
  assert.equal(formatEstimatedWeight(0.001), "0,001");
  assert.equal(formatEstimatedWeight(null), "");
});

test("every concrete catalog species has a sourced finite estimator relationship", () => {
  const unsupported = new Set(SPECIES_WITHOUT_LENGTH_WEIGHT_RELATIONSHIP.map((species) => species.speciesId));
  const concreteSpecies = DEFAULT_SPECIES.filter((species) => species.latinName && !species.latinName.includes(" spp."));
  assert.equal(Object.keys(LENGTH_WEIGHT_RELATIONSHIPS).length, concreteSpecies.length);
  assert.deepEqual(concreteSpecies.filter((species) => !LENGTH_WEIGHT_RELATIONSHIPS[species.key] && !unsupported.has(species.key)), []);
  for (const species of concreteSpecies) {
    if (unsupported.has(species.key)) continue;
    const relationship = LENGTH_WEIGHT_RELATIONSHIPS[species.key];
    assert.equal(relationship.speciesId, species.key);
    assert.equal(relationship.scientificName, species.latinName);
    assert.match(relationship.sourceReference, /^https:\/\/www\.fishbase\.se\/summary\//);
    for (const length of ["1", "60"]) {
      const estimate = estimateFishWeight(species.key, length);
      assert.ok(Number.isFinite(estimate) && estimate > 0, `${species.key} should produce a positive finite estimate at ${length} cm`);
    }
  }
  assert.deepEqual(SPECIES_WITHOUT_LENGTH_WEIGHT_RELATIONSHIP.map((species) => species.speciesId), ["hybridSilverBigheadCarp"]);
});
