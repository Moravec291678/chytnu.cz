import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("onboarding explains local-first storage, publication consent, and optional GPS in two short steps", async () => {
  const source = await readFile(new URL("./OnboardingPage.jsx", import.meta.url), "utf8");
  assert.match(source, /ukládají nejprve v zařízení a po přihlášení se synchronizují/);
  assert.match(source, /Nic se nesdílí veřejně bez tvého potvrzení/);
  assert.match(source, /GPS je volitelné/);
  assert.match(source, /Přesnou polohu nikde automaticky nezveřejňujeme/);
  assert.match(source, /1 ze 2[\s\S]*2 ze 2/);
});
