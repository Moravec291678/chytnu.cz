import test from "node:test";
import assert from "node:assert/strict";
import { readTrophySelection, saveTrophySelection } from "./trophySelection.js";

function memoryStorage() { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }

test("trophy cabinet choices persist separately by data scope and cap at five", () => {
  const storage = memoryStorage();
  saveTrophySelection("guest-a", ["1", "2", "2"], storage);
  assert.deepEqual(readTrophySelection("guest-a", storage), ["1", "2"]);
  assert.equal(readTrophySelection("account-b", storage), null);
  assert.throws(() => saveTrophySelection("guest-a", ["1", "2", "3", "4", "5", "6"], storage));
});
