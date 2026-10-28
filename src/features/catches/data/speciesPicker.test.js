import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SPECIES, SPECIES_CATEGORIES } from "../../../shared/constants/speciesCatalog.js";
import { filterSpeciesCatalog, getPrimarySpeciesCategoryKey, getSpeciesForCategory } from "./speciesPicker.js";

test("Full Add picker keeps the original category overview and exposes every catalog species", () => {
  const categoryLabels = new Set(SPECIES_CATEGORIES.map(({ label }) => label));
  for (const label of ["⭐ Nejčastější úlovky", "🐟 Kaprovité", "🦷 Dravci", "🏞️ Lososovité", "🐟 Sumci", "🐍 Úhoři"]) {
    assert.ok(categoryLabels.has(label), `missing category ${label}`);
  }

  const primaryCategories = new Set([
    "cyprinids", "predators", "salmonids", "catfish", "eels", "sturgeons", "smallFish",
  ]);
  const visibleIds = new Set(DEFAULT_SPECIES
    .filter((species) => primaryCategories.has(getPrimarySpeciesCategoryKey(species)))
    .map((species) => species.key));
  assert.deepEqual(visibleIds, new Set(DEFAULT_SPECIES.map((species) => species.key)));
});

test("category filters return central catalog records by stable ID and retain search context", () => {
  const carp = getSpeciesForCategory("cyprinids", DEFAULT_SPECIES).find((species) => species.key === "commonCarp");
  assert.equal(carp, DEFAULT_SPECIES.find((species) => species.key === "commonCarp"));
  assert.deepEqual(getSpeciesForCategory("cyprinids", DEFAULT_SPECIES).map((species) => species.key).includes("northernPike"), false);
  assert.ok(getSpeciesForCategory("common", DEFAULT_SPECIES).some((species) => species.key === "commonCarp"));
  assert.ok(getSpeciesForCategory("protected", DEFAULT_SPECIES).every((species) => species.isProtected));
  assert.ok(getSpeciesForCategory("nonNative", DEFAULT_SPECIES).every((species) => species.isNonNative));
});

test("species search ignores Czech accents and supports scientific names", () => {
  assert.ok(filterSpeciesCatalog(DEFAULT_SPECIES, "stika").some((species) => species.key === "northernPike"));
  assert.ok(filterSpeciesCatalog(DEFAULT_SPECIES, "cyprinus carpio").some((species) => species.key === "commonCarp"));
});
