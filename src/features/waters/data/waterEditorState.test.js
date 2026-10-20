import test from "node:test";
import assert from "node:assert/strict";
import { resolveWaterEditorView } from "./waterEditorState.js";

test("a missing Water edit route renders not-found instead of an empty editor", () => {
  assert.equal(resolveWaterEditorView({ waterId: "missing", loading: false, record: null, error: "" }), "not-found");
  assert.equal(resolveWaterEditorView({ waterId: "missing", loading: true, record: null, error: "" }), "loading");
  assert.equal(resolveWaterEditorView({ waterId: "missing", loading: false, record: null, error: "storage failed" }), "error");
  assert.equal(resolveWaterEditorView({ waterId: "known", loading: false, record: { id: "known" }, error: "" }), "editor");
  assert.equal(resolveWaterEditorView({ waterId: undefined, loading: false, record: null, error: "" }), "editor");
});
