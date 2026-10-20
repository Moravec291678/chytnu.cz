import test from "node:test";
import assert from "node:assert/strict";
import { resolveCatchTripId } from "./catchTripDefault.js";

test("a new Catch defaults to the active Trip while explicit navigation takes priority", () => {
  assert.equal(resolveCatchTripId({ activeTripId: "active" }), "active");
  assert.equal(resolveCatchTripId({ activeTripId: "active", requestedTripId: "requested" }), "requested");
  assert.equal(resolveCatchTripId({ activeTripId: "active", currentTripId: "selected" }), "selected");
});

test("editing never replaces the Catch's stored Trip", () => {
  assert.equal(resolveCatchTripId({ isEditing: true, currentTripId: "stored", activeTripId: "active" }), "stored");
  assert.equal(resolveCatchTripId({ isEditing: true, currentTripId: "", activeTripId: "active" }), "");
});
