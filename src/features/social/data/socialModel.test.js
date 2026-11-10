import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalPair, canonicalWater, canReadSocial, normalizedHandle, SOCIAL_PATHS, validateSocialRecord } from "./socialModel.js";
const time = 1_800_000_000_000, base = { createdAt: time, updatedAt: time };
const fixtures = {
  profile: { uid: "a", handle: "angler", displayName: "Rybář", bio: "", visibility: "private" }, handle: { uid: "a" },
  relationship: { memberUids: ["a", "b"], requestedBy: "a", status: "pending" },
  post: { ownerUid: "a", text: "Výprava", visibility: "private" }, comment: { ownerUid: "a", text: "Gratuluji" },
  reaction: { ownerUid: "a", kind: "like" }, block: { ownerUid: "a", targetUid: "b" },
  nearby: { ownerUid: "a", coarseCell: "u2fk", expiresAt: time + 60_000 },
  presence: { ownerUid: "a", waterId: `ris-${"a".repeat(24)}`, expiresAt: time + 60_000 },
  room: { waterId: `ris-${"a".repeat(24)}` }, message: { ownerUid: "a", text: "Ahoj" },
  conversation: { memberUids: ["a", "b"] }, crew: { ownerUid: "a", memberUids: ["a", "b"], name: "Parta", visibility: "private" },
};
for (const [kind, fixture] of Object.entries(fixtures)) {
  test(`social ${kind}: strict whitelist, no credentials/GPS/roles and valid timestamps`, () => {
    assert.deepEqual(validateSocialRecord(kind, { ...base, ...fixture }, { now: time }), { ...base, ...fixture });
    for (const extra of [{ role: "OWNER" }, { latitude: 50 }, { photoUrl: "https://private" }, { xp: 999 }, { createdAt: time + 1 }])
      assert.throws(() => validateSocialRecord(kind, { ...base, ...fixture, ...extra }, { now: time }));
  });
}
test("social canonical identity, RIS and private notification mapping", () => {
  assert.equal(canonicalPair("a_b", "c"), canonicalPair("c", "a_b"));
  assert.notEqual(canonicalPair("a_b", "c"), canonicalPair("a", "b_c"));
  assert.throws(() => canonicalPair("a", "a")); assert.throws(() => canonicalPair("a/b", "c"));
  assert.throws(() => canonicalWater("private-water-id"));
  assert.equal(normalizedHandle("RybAR_1"), "rybar_1"); assert.throws(() => normalizedHandle("../admin"));
  assert.equal(SOCIAL_PATHS.notifications("a"), "users/a/notifications");
});
test("social permission defaults, accepted friendship and blocking", () => {
  assert.equal(canReadSocial({ viewerUid: "b", ownerUid: "a" }), false);
  assert.equal(canReadSocial({ viewerUid: "b", ownerUid: "a", visibility: "friends", friends: true }), true);
  assert.equal(canReadSocial({ viewerUid: "b", ownerUid: "a", visibility: "public", blocked: true }), false);
  assert.equal(canReadSocial({ viewerUid: "a", ownerUid: "a", unavailable: true }), false);
  assert.equal(canReadSocial({ ownerUid: "a", visibility: "public" }), false);
});
test("social presence cannot carry precise GPS or remain indefinitely", () => {
  assert.equal(validateSocialRecord("crew", { ...base, ...fixtures.crew, memberUids: ["a"] }, { now: time }).memberUids.length, 1);
  for (const expiresAt of [time, time + 31 * 60_000]) assert.throws(() => validateSocialRecord("nearby", { ...base, ...fixtures.nearby, expiresAt }, { now: time }));
  assert.throws(() => validateSocialRecord("nearby", { ...base, ...fixtures.nearby, coarseCell: "u2fkbcd" }, { now: time }));
  assert.throws(() => validateSocialRecord("relationship", { ...base, ...fixtures.relationship, requestedBy: "c" }, { now: time }));
});
