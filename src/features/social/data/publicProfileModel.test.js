import assert from "node:assert/strict";
import { test } from "node:test";
import { validateProfileInput, validateStoredProfile, publicCatchProjection, sectionAllowed } from "./publicProfileModel.js";
const input = { handle: "RybAr", displayName: "Rybář" };
test("public profile opt-in defaults and Unicode username normalization", () => {
  const profile = validateProfileInput(input);
  assert.equal(profile.visibility, "private"); assert.equal(profile.discoverable, false);
  assert.ok(Object.values(profile.sections).every(v => v === "private"));
  assert.deepEqual(profile.sharedCatchIds, []); assert.deepEqual(profile.sharedPhotos, []);
  assert.equal(validateProfileInput({ ...input, handle: "Ｒｙｂａｒ" }).handle, "rybar");
});
test("profile does not accept UID, roles, credentials, arbitrary sections or asset paths", () => {
  for (const extra of [{ uid: "other" }, { badgeRole: "OWNER" }, { avatarAssetId: "a".repeat(32) }, { role: "CO_CREATOR" }, { email: "secret" },
    { sections: { coordinates: "public" } }, { sharedPhotos: [{ catchId: "catch", photoId: "photo", url: "https://private" }] },
    { sharedCatchIds: Array(13).fill("x") }, { sharedCatchIds: ["../x"] }]) assert.throws(() => validateProfileInput({ ...input, ...extra }));
});
test("legacy profile activation preserves base identity and uses private section defaults", () => {
  const profile = validateStoredProfile({ uid: "user", ...input, handle: "rybar", bio: "", visibility: "public", createdAt: 1, updatedAt: 1 }, 2);
  assert.equal(profile.uid, "user"); assert.equal(profile.sections.gallery, "private");
});
test("biography supports safe newlines, not hidden control characters", () => {
  const profile = { ...input, bio: "První řádek\nDruhý řádek" };
  assert.equal(validateProfileInput(profile).bio, profile.bio);
  assert.equal(validateStoredProfile({ ...profile, handle: "rybar", uid: "user", visibility: "private", createdAt: 1, updatedAt: 1 }, 2).bio, profile.bio);
  assert.throws(() => validateProfileInput({ ...input, bio: "A\u0000B" }));
});
test("per-section visibility fails closed for strangers and friends", () => {
  assert.equal(sectionAllowed("private", "friend"), false); assert.equal(sectionAllowed("friends", "friend"), true);
  assert.equal(sectionAllowed("friends", "stranger"), false); assert.equal(sectionAllowed("public", "stranger"), true);
});
test("public catch DTO excludes notes, location, times, email, photos and private water names", () => {
  const dto = publicCatchProjection({ id: "catch", species: "Kapr", lengthCm: 52, caughtAt: "2026-11-10T14:25:30Z", notes: "Secret", email: "Secret", waterName: "Secret", coordinates: { latitude: 50, longitude: 14 }, photos: ["Secret"] });
  assert.deepEqual(dto, { id: "catch", species: "Kapr", lengthCm: 52, caughtAt: "2026-11-10" });
  assert.equal(publicCatchProjection({ id: "x", species: "Kapr", deleted: true }), null);
});
