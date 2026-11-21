import test from "node:test";
import assert from "node:assert/strict";
import { advancePhoto, swipePhotoDirection } from "./photoViewerNavigation.js";

test("horizontal swipe advances in either direction and rejects taps, vertical moves and diagonals", () => {
  const start = { x: 100, y: 100 };
  assert.equal(swipePhotoDirection(start, { x: 28, y: 113 }), 1);
  assert.equal(swipePhotoDirection(start, { x: 180, y: 121 }), -1);
  for (const end of [{ x: 147, y: 100 }, { x: 160, y: 157 }, { x: 170, y: 210 }, start]) {
    assert.equal(swipePhotoDirection(start, end), 0);
  }
});

test("view navigation handles zero, one and twenty photos with wraparound", () => {
  assert.equal(advancePhoto(-1, 0, 1), -1);
  assert.equal(advancePhoto(0, 1, 1), 0);
  assert.equal(advancePhoto(0, 20, -1), 19);
  assert.equal(advancePhoto(19, 20, 1), 0);
  assert.equal(advancePhoto(5, 20, 1), 6);
});
