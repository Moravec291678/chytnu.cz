import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Quick Add and Full Add share a length-first two-column measurement layout", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("./AddCatchPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("./AddCatchPage.css", import.meta.url), "utf8"),
  ]);
  const gridStart = source.indexOf('"measurements-grid measurements-grid-full"');
  const gridEnd = source.indexOf("{displayFull && (", gridStart);
  const grid = source.slice(gridStart, gridEnd);
  assert.ok(grid.indexOf("Délka (cm)") >= 0);
  assert.ok(grid.indexOf("Délka (cm)") < grid.indexOf("Váha (kg)"));
  assert.match(styles, /\.measurements-grid\s*\{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
