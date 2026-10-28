import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Privacy settings expose a scoped default for new Catch records", async () => {
  const source = await readFile(new URL("./PrivacyPage.jsx", import.meta.url), "utf8");
  assert.match(source, /Výchozí viditelnost nových úlovků/);
  assert.match(source, /defaultCatchVisibility: visibility, defaultCatchVisibilityExplicit: true/);
  assert.match(source, /Platí pro nové úlovky\. Již uložené záznamy se nezmění/);
});
