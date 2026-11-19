import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NEW_ENTRY_VISIBILITY, entryComposerPayload } from "./entryComposerModel.js";

test("new posts propose public visibility; authorization is controlled by the saved profile receipt", () => {
  assert.equal(DEFAULT_NEW_ENTRY_VISIBILITY, "public");
});

test("entry edits retain owner entry identity, type and loaded CAS revision", () => {
  const post = { sourceEntryId: "original-entry", kind: "experience", revision: 7 };
  const draft = { entryId: "unrelated-draft", kind: "milestone", visibility: "public", description: " Upravený text ", title: " Nový titulek ", achievementId: "unrelated", progression: { xp: 999999 } };
  assert.deepEqual(entryComposerPayload(draft, post), { entryId: "original-entry", kind: "experience", visibility: "public", expectedRevision: 7, description: "Upravený text", title: "Nový titulek" });
  assert.deepEqual(entryComposerPayload(draft, post), entryComposerPayload(draft, post));
});

test("new entries keep the draft UUID across retries and do not submit claimed achievement or XP snapshots", () => {
  const draft = { entryId: "stable-draft", kind: "achievement", visibility: "private", description: " Můj zážitek ", title: "unapproved title", achievementId: "first-catch", achievement: { verified: true }, progression: { xp: 999999 } };
  assert.deepEqual(entryComposerPayload(draft), { entryId: "stable-draft", kind: "achievement", visibility: "private", expectedRevision: 0, description: "Můj zážitek", achievementId: "first-catch" });
  assert.equal(entryComposerPayload(draft).entryId, entryComposerPayload(draft).entryId);
});
