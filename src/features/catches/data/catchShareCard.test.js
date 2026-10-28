import test from "node:test";
import assert from "node:assert/strict";
import { createCatchShareData } from "./catchShare.js";
import { getSharePreviewFrameStyle, renderShareCard } from "./catchShareCard.js";

function createCanvasHarness() {
  const text = [];
  const images = [];
  const context = new Proxy({
    font: "10px sans-serif",
    measureText(value) {
      const size = Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 10);
      return { width: String(value).length * size * 0.54 };
    },
    fillText(value, x, y) { text.push({ value: String(value), x, y, font: this.font }); },
    drawImage(...args) { images.push(args); },
    createLinearGradient() { return { addColorStop() {} }; },
  }, {
    get(target, key) {
      if (key in target) return target[key];
      return () => {};
    },
  });
  const canvas = {
    getContext: () => context,
    toBlob(callback, type) { callback(new Blob(["card"], { type })); },
  };
  return { text, images, canvas };
}

async function renderWithCanvas(t, data, photoBlob = null, photoFrame = {}) {
  const harness = createCanvasHarness();
  const previousDocument = globalThis.document;
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const previousCreateImageBitmap = globalThis.createImageBitmap;
  globalThis.document = { createElement: () => harness.canvas, documentElement: {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  if (photoBlob) globalThis.createImageBitmap = async () => ({ width: photoBlob.width, height: photoBlob.height, close() {} });
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
    if (previousCreateImageBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = previousCreateImageBitmap;
  });
  const blob = await renderShareCard(data, photoBlob, photoFrame);
  assert.equal(blob.type, "image/png");
  return harness;
}

test("share card gives length the lead, keeps estimated source internal, and fits a long species name", async (t) => {
  const data = createCatchShareData({
    species: "Pstruh duhový jezerní forma s mimořádně dlouhým názvem",
    speciesKey: "rainbowTrout",
    lengthCm: 82,
    weightKg: 7.4,
    weightSource: "estimated",
  });
  const harness = await renderWithCanvas(t, data);
  const drawn = harness.text.map((item) => item.value).join(" ");
  const length = harness.text.find((item) => item.value === "82 cm");
  const weight = harness.text.find((item) => item.value === "7,4 kg");
  const species = harness.text.find((item) => item.value.endsWith("…"));

  assert.equal(data.weightSource, "estimated");
  assert.ok(length);
  assert.ok(weight);
  assert.ok(length.y < weight.y);
  assert.ok(Number(length.font.match(/(\d+(?:\.\d+)?)px/)?.[1]) > Number(weight.font.match(/(\d+(?:\.\d+)?)px/)?.[1]));
  assert.ok(species);
  assert.ok(species.value.length < data.species.length);
  assert.doesNotMatch(drawn, /odhad/i);
});

test("share card handles missing length and weight, private location, and no photo", async (t) => {
  const data = createCatchShareData({
    species: "Kapr obecný",
    speciesKey: "commonCarp",
    lengthCm: Number.NaN,
    weightKg: Number.NaN,
    weightSource: "estimated",
    waterId: "private-water",
    locationName: "Soukromý revír",
    privacy: { visibility: "private", privateSpot: true, locationPrecision: "exact" },
  }, { id: "private-water", name: "Soukromý revír" });
  const harness = await renderWithCanvas(t, data);
  const drawn = harness.text.map((item) => item.value).join(" ");

  assert.equal(data.waterName, null);
  assert.match(drawn, /Zaznamenaný úlovek/);
  assert.doesNotMatch(drawn, /cm|kg|Odhad|Soukromý revír/i);
  assert.equal(harness.images.length, 0);
});

test("landscape and portrait photos use the same lower portrait frame and stored focal point and zoom", async (t) => {
  const frame = { focalX: 0.8, focalY: 0.15, zoom: 1.6 };
  const landscapeBlob = Object.assign(new Blob(["landscape"], { type: "image/jpeg" }), { width: 1600, height: 900 });
  const portraitBlob = Object.assign(new Blob(["portrait"], { type: "image/jpeg" }), { width: 900, height: 1600 });
  const landscape = await renderWithCanvas(t, { species: "Kapr", rarity: "Běžný" }, landscapeBlob, frame);
  const portrait = await renderWithCanvas(t, { species: "Kapr", rarity: "Běžný" }, portraitBlob, frame);
  const landscapeDraw = landscape.images[0];
  const portraitDraw = portrait.images[0];

  assert.equal(landscape.images.length, 1);
  assert.equal(portrait.images.length, 1);
  assert.deepEqual(landscapeDraw.slice(5), [210, 900, 660, 780]);
  assert.deepEqual(portraitDraw.slice(5), [210, 900, 660, 780]);
  assert.ok(landscapeDraw[1] > 0 && landscapeDraw[2] > 0);
  assert.ok(portraitDraw[1] > 0 && portraitDraw[2] > 0);
  assert.ok(landscapeDraw[1] > portraitDraw[1]);
  assert.deepEqual(getSharePreviewFrameStyle(frame), {
    objectPosition: "80% 15%",
    transform: "scale(1.6)",
    transformOrigin: "80% 15%",
  });
});
