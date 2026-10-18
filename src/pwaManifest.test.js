import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicUrl = new URL("../public/", import.meta.url);

test("PWA manifest provides installable 192 px and 512 px PNG icons", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", publicUrl), "utf8"));
  const expected = new Map([["192x192", 192], ["512x512", 512]]);

  for (const icon of manifest.icons.filter((item) => item.type === "image/png")) {
    if (!expected.has(icon.sizes)) continue;
    const bytes = await readFile(new URL(icon.src.slice(1), publicUrl));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), expected.get(icon.sizes));
    assert.equal(bytes.readUInt32BE(20), expected.get(icon.sizes));
    expected.delete(icon.sizes);
  }

  assert.deepEqual([...expected.keys()], []);
});
