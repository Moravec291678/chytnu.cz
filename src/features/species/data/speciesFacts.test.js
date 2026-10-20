import test from "node:test";
import assert from "node:assert/strict";
import { getSpeciesFacts } from "./speciesFacts.js";

test("species facts are only available when the selected species has its own facts data", () => {
  assert.deepEqual(getSpeciesFacts({ key: "carp", facts: ["Žije ve stojatých vodách."] }), ["Žije ve stojatých vodách."]);
  assert.equal(getSpeciesFacts({ key: "pike", facts: [] }), null);
  assert.equal(getSpeciesFacts({ key: "roach" }), null);
});
