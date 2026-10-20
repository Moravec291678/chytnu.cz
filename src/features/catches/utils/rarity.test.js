import test from "node:test";
import assert from "node:assert/strict";
import { getCatchRarity, RARITY_LEVELS } from "./rarity.js";

const mockCatalog = [
  { key: "commonCarp", isCommon: true, isProtected: false },
  { key: "crucianCarp", isCommon: false, isProtected: true },
  { key: "blackAmur", isCommon: false, isProtected: false },
  { key: "pike", isCommon: true, isProtected: false },
];

test("deterministic catch rarity classification", () => {
  // Common carp of average size
  const common = getCatchRarity({ speciesKey: "commonCarp", weightKg: 2 }, mockCatalog);
  assert.equal(common.key, RARITY_LEVELS.COMMON.key);

  // Protected species (crucianCarp)
  const rare = getCatchRarity({ speciesKey: "crucianCarp", weightKg: 0.5 }, mockCatalog);
  assert.equal(rare.key, RARITY_LEVELS.RARE.key);

  // Non-common species
  const uncommon = getCatchRarity({ speciesKey: "blackAmur", weightKg: 2 }, mockCatalog);
  assert.equal(uncommon.key, RARITY_LEVELS.UNCOMMON.key);

  // Epic size (>= 10 kg)
  const epic = getCatchRarity({ speciesKey: "commonCarp", weightKg: 12 }, mockCatalog);
  assert.equal(epic.key, RARITY_LEVELS.EPIC.key);

  // Legendary trophy (>= 20 kg or >= 100 cm)
  const legendary = getCatchRarity({ speciesKey: "commonCarp", weightKg: 22 }, mockCatalog);
  assert.equal(legendary.key, RARITY_LEVELS.LEGENDARY.key);

  const legendaryLength = getCatchRarity({ speciesKey: "pike", lengthCm: 105 }, mockCatalog);
  assert.equal(legendaryLength.key, RARITY_LEVELS.LEGENDARY.key);
});
