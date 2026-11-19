import test from "node:test";
import assert from "node:assert/strict";
import { canShareWithAudience, editableProfile, hasPublicPublicationConsent, privacyDefaultsForSharingMode, requiresProfilePublicConsent, sharingProfilePreset } from "./profileSettingsModel.js";

test("only new profile forms propose public sections and discovery before the upfront choice", () => {
  const created = editableProfile(null, { newProfile: true });
  assert.equal(created.visibility, "public");
  assert.ok(Object.values(created.sections).every(value => value === "public"));
  assert.equal(created.discoverable, true);
  assert.equal(created.directoryDiscoverable, true);
  assert.equal(created.regionDiscoverable, false);
  assert.deepEqual(created.sharedCatchIds, []);
  assert.deepEqual(created.sharedPhotos, []);
  assert.deepEqual(created.sharedAchievementIds, []);
  assert.equal(editableProfile(null).visibility, "private");
});

test("stored profile privacy is preserved and public transitions require confirmation", () => {
  const existing = { visibility: "private", sections: { catches: "friends" }, discoverable: false };
  const edited = editableProfile(existing, { newProfile: true });
  assert.equal(edited.visibility, "private");
  assert.equal(edited.sections.catches, "friends");
  assert.equal(edited.sections.gallery, "private");
  assert.equal(edited.discoverable, false);
  assert.equal(requiresProfilePublicConsent(editableProfile(null, { newProfile: true }), null), true);
  assert.equal(requiresProfilePublicConsent({ ...edited, visibility: "public" }, existing), true);
  assert.equal(requiresProfilePublicConsent({ ...edited, visibility: "public" }, { ...existing, visibility: "public" }), false);
});

test("private mode and returning public never reselect historical source records", () => {
  const existing = editableProfile({ visibility: "public", sections: { gallery: "public" }, sharedCatchIds: ["old"], sharedPhotos: [{ catchId: "old", photoId: "photo" }], sharedAchievementIds: ["first-catch"], regionDiscoverable: true });
  const privateMode = sharingProfilePreset(existing, "private");
  assert.equal(privateMode.visibility, "private");
  assert.equal(privateMode.discoverable, false);
  assert.ok(Object.values(privateMode.sections).every(value => value === "private"));
  const publicMode = sharingProfilePreset(privateMode, "public");
  assert.deepEqual(publicMode.sharedCatchIds, []);
  assert.deepEqual(publicMode.sharedPhotos, []);
  assert.deepEqual(publicMode.sharedAchievementIds, []);
  assert.equal(publicMode.regionDiscoverable, false);
  assert.deepEqual(existing.sharedCatchIds, ["old"]);
});

test("public publication requires the current server acknowledgement; private receipt also blocks friends", () => {
  for (const receipt of [null, undefined, { mode: "public" }, { version: 2, mode: "public" }, { version: 1, mode: "private" }]) {
    assert.equal(hasPublicPublicationConsent(receipt), false);
    assert.equal(canShareWithAudience(receipt, "public"), false);
    assert.equal(canShareWithAudience(receipt, "private"), true);
  }
  assert.equal(canShareWithAudience(null, "friends"), true);
  assert.equal(canShareWithAudience({ version: 1, mode: "private" }, "friends"), false);
  const receipt = { version: 1, mode: "public", epoch: "server-epoch" };
  assert.equal(canShareWithAudience(receipt, "public"), true);
  assert.equal(canShareWithAudience(receipt, "friends"), true);
});

test("receipt changes only future local catch defaults and preserves private GPS and unrelated settings", () => {
  const existing = { nearbyOptIn: false, heatmapOptIn: false, privateSpotDefault: false, defaultLocationPrecision: "exact" };
  const publicDefaults = privacyDefaultsForSharingMode(existing, { version: 1, mode: "public" });
  assert.equal(publicDefaults.defaultCatchVisibility, "public");
  assert.equal(publicDefaults.defaultPhotoVisibility, "public");
  assert.equal(publicDefaults.defaultCatchVisibilityExplicit, true);
  assert.equal(publicDefaults.privateSpotDefault, true);
  assert.equal(publicDefaults.defaultLocationPrecision, "none");
  assert.equal(publicDefaults.nearbyOptIn, false);
  const privateDefaults = privacyDefaultsForSharingMode(publicDefaults, { version: 1, mode: "private" });
  assert.equal(privateDefaults.defaultCatchVisibility, "private");
  assert.equal(privateDefaults.defaultPhotoVisibility, "private");
  assert.equal(existing.defaultLocationPrecision, "exact");
});
