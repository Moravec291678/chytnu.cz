import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("each application route has exactly one owner in the final product map", async () => {
  const [router, map] = await Promise.all([
    readFile(new URL("./app/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/CHYTNU_FINAL_ROUTE_MAP.md", import.meta.url), "utf8"),
  ]);
  const runtimeRoutes = [...router.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map(([, path]) => path);
  const mappedRoutes = [...map.matchAll(/^- `([^\n`]+)` · (\d{2}) · .+/gm)];
  assert.ok(runtimeRoutes.length > 0);
  assert.ok(mappedRoutes.every(([, , owner]) => Number(owner) >= 1 && Number(owner) <= 23));
  assert.equal(new Set(mappedRoutes.map(([, path]) => path)).size, mappedRoutes.length);
  assert.deepEqual(mappedRoutes.map(([, path]) => path).sort(), runtimeRoutes.sort());
});
