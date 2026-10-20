import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SPECIES } from "../../../shared/constants/speciesCatalog.js";
import {
  DEFAULT_QUICK_SPECIES_IDS,
  MAX_QUICK_SPECIES,
  normalizeQuickSpeciesIds,
  readQuickSpeciesIds,
  saveQuickSpeciesIds,
  toggleQuickSpecies,
} from "./quickSpeciesPreferences.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("new scopes get catalog-backed stable-ID defaults", () => {
  const ids = readQuickSpeciesIds("guest:new", memoryStorage());
  assert.deepEqual(ids, DEFAULT_QUICK_SPECIES_IDS);
  assert.ok(ids.every((id) => DEFAULT_SPECIES.some((species) => species.key === id)));
});

test("add, remove, empty selection, and maximum limit are explicit", () => {
  const validIds = new Set(DEFAULT_SPECIES.map((species) => species.key));
  let result = toggleQuickSpecies([], "commonCarp");
  assert.deepEqual(result.ids, ["commonCarp"]);
  result = toggleQuickSpecies(result.ids, "commonCarp");
  assert.deepEqual(result.ids, []);
  assert.equal(toggleQuickSpecies([], "unknown").ids.length, 0);
  const full = normalizeQuickSpeciesIds([...validIds].slice(0, MAX_QUICK_SPECIES));
  result = toggleQuickSpecies(full, [...validIds].find((id) => !full.includes(id)));
  assert.equal(result.ids.length, MAX_QUICK_SPECIES);
  assert.equal(result.error, "V rychlém výběru může být maximálně 8 druhů.");
});

test("scope preferences survive reload and stay isolated", () => {
  const storage = memoryStorage();
  saveQuickSpeciesIds("account:a", ["commonCarp", "grassCarp"], storage);
  saveQuickSpeciesIds("account:b", ["brownTrout"], storage);
  assert.deepEqual(readQuickSpeciesIds("account:a", storage), ["commonCarp", "grassCarp"]);
  assert.deepEqual(readQuickSpeciesIds("account:b", storage), ["brownTrout"]);
  assert.deepEqual(readQuickSpeciesIds("guest:a", storage), DEFAULT_QUICK_SPECIES_IDS);
});

test("unknown, duplicate, and excess saved IDs are safely ignored", () => {
  assert.deepEqual(normalizeQuickSpeciesIds(["commonCarp", "removed", "commonCarp", "tench"]), ["commonCarp", "tench"]);
  assert.equal(normalizeQuickSpeciesIds([...new Set(DEFAULT_SPECIES.map((species) => species.key))].slice(0, MAX_QUICK_SPECIES + 1)).length, MAX_QUICK_SPECIES);
});
