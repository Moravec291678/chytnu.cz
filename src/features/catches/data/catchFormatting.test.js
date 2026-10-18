import test from "node:test";
import assert from "node:assert/strict";
import { formatBottomType } from "./catchFormatting.js";

test("bottom type stored as a stable key is shown with a Czech label", () => {
  assert.equal(formatBottomType("mud"), "Bahno");
  assert.equal(formatBottomType("sand"), "Písek");
  assert.equal(formatBottomType("gravel"), "Štěrk");
  assert.equal(formatBottomType("rocks"), "Kamení");
});

test("unknown future bottom types remain readable and missing values stay empty", () => {
  assert.equal(formatBottomType("vegetation"), "vegetation");
  assert.equal(formatBottomType(""), null);
  assert.equal(formatBottomType(null), null);
});
