import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const worker = await readFile(new URL("sw.js", dist), "utf8");
const declaration = /^const FILES = (.+);$/m.exec(worker);
assert.ok(declaration, "Offline worker has a precache manifest");
const files = JSON.parse(declaration[1]);
assert.ok(Array.isArray(files) && files.includes("/index.html"), "Offline manifest contains the HTML shell");
assert.equal(new Set(files).size, files.length, "Offline manifest paths are unique");
await Promise.all(files.map(async path => {
  assert.match(path, /^\/(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+$/);
  const url = new URL(path.slice(1), dist);
  assert.ok(await stat(url).then(entry => entry.isFile(), () => false), `Offline manifest entry is missing: ${path}`);
}));
console.log(`Offline manifest verified (${files.length} files).`);
