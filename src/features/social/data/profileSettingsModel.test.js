import test from "node:test";
import assert from "node:assert/strict";
import { editableProfile, requiresProfilePublicConsent } from "./profileSettingsModel.js";

test("only a newly created profile gets the public top-level default; all content sections remain private", () => {
  const created = editableProfile(null, { newProfile: true });
  assert.equal(created.visibility, "public");
  assert.ok(Object.values(created.sections).every(value => value === "private"));
  assert.equal(created.discoverable, false);
  assert.equal(editableProfile(null).visibility, "private");
});

test("stored profile privacy is preserved and public transitions require confirmation", () => {
  const existing = { visibility: "private", sections: { catches: "friends" }, discoverable: false };
  const edited = editableProfile(existing, { newProfile: true });
  assert.equal(edited.visibility, "private");
  assert.equal(edited.sections.catches, "friends");
  assert.equal(requiresProfilePublicConsent(editableProfile(null, { newProfile: true }), null), true);
  assert.equal(requiresProfilePublicConsent({ ...edited, visibility: "public" }, existing), true);
  assert.equal(requiresProfilePublicConsent({ ...edited, visibility: "public" }, { ...existing, visibility: "public" }), false);
});
