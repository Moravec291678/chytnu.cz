import test from "node:test";
import assert from "node:assert/strict";
import { speciesSuggestionForEditor } from "./approveSpeciesInEditor.js";
test("editor proposal only prefills an unchanged empty species with the same photo digest", () => {
  const record = { ownerId: "owner", sync: { revision: 4, serverRevision: 3 }, photos: [{ id: "photo", contentSha256: "digest" }] };
  const proposal = { ownerId: "owner", sourceSha256: "digest", status: "suggestion", expectedRevision: 4, expectedServerRevision: 3, photoId: "photo", photoHash: "digest", speciesKey: "commonCarp" };
  assert.equal(speciesSuggestionForEditor(record, proposal).key, "commonCarp");
  for (const changed of [{ ...record, ownerId: "other" }, { ...record, deleted: true }, { ...record, speciesKey: "pike" },
    { ...record, sync: { revision: 5 } }, { ...record, photos: [] },
    { ...record, sync: { revision: 4, serverRevision: 4 } },
    { ...record, quickCatch: { provenance: { speciesKey: "manual" } } }]) {
    assert.equal(speciesSuggestionForEditor(changed, proposal), null);
  }
  assert.equal(speciesSuggestionForEditor(record, { ...proposal, photoHash: "changed" }), null);
  assert.equal(speciesSuggestionForEditor(record, { ...proposal, sourceSha256: "changed" }), null);
  assert.equal(speciesSuggestionForEditor(record, { ...proposal, speciesKey: "invented" }), null);
});
