import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [primitives, styles, states, catchCard, speciesCard] = await Promise.all([
  readFile(new URL("./UIPrimitives.jsx", import.meta.url), "utf8"),
  readFile(new URL("./UIPrimitives.css", import.meta.url), "utf8"),
  readFile(new URL("./UIStates.jsx", import.meta.url), "utf8"),
  readFile(new URL("../../features/catches/components/CatchCard.jsx", import.meta.url), "utf8"),
  readFile(new URL("../../features/species/components/SpeciesCard.jsx", import.meta.url), "utf8"),
]);

test("shared UI primitives cover button variants, composable cards, and semantic badges", () => {
  assert.match(primitives, /export function Button\(/);
  assert.match(primitives, /export function Card\(/);
  assert.match(primitives, /export function Badge\(/);
  for (const variant of ["primary", "secondary", "quiet", "danger"]) {
    assert.match(styles, new RegExp(`\\.ui-button--${variant}\\b`));
  }
  for (const tone of ["neutral", "record", "species", "released", "kept"]) {
    assert.match(styles, new RegExp(`\\.ui-badge--${tone}\\b`));
  }
});

test("catch and species cards share Card and Badge styling without sharing domain markup", () => {
  assert.match(catchCard, /<Card as="article" density="compact" interactive/);
  assert.match(speciesCard, /<Card density="comfortable" interactive/);
  assert.match(catchCard, /<Badge size="compact" tone="record">/);
  assert.match(speciesCard, /<Badge tone="species">/);
  assert.match(states, /<Button variant="secondary" onClick=\{onRetry\}>/);
});
