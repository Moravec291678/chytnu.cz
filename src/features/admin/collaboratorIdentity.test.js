import test from "node:test";
import assert from "node:assert/strict";
import { collaboratorIdentity } from "./collaboratorIdentity.js";
import { resolveAccess } from "./adminPolicy.js";
import { configuredOwnerUid, configuredCoCreatorUid } from "./server/adminAccess.js";

test("principal identity projects only public presentation from the trusted role", () => {
  for (const [role, label] of [["OWNER", "Zakladatel ChytnuCz"], ["CO_CREATOR", "Spolutvůrce ChytnuCz"]]) {
    const identity = collaboratorIdentity({ role, uid: "private-uid", email: "private@example.test", permissions: ["users.manage"], label: "spoof", badge: "spoof" });
    assert.equal(identity.label, label);
    assert.deepEqual(Object.keys(identity).sort(), ["badge", "label", "role", "shortLabel", "theme"]);
    assert.doesNotMatch(JSON.stringify(identity), /private|users.manage|spoof/);
    identity.label = "modified"; assert.equal(collaboratorIdentity({ role }).label, label);
  }
});

test("editable profile identities cannot promote a user or award principal badges", () => {
  for (const role of ["OWNER", "CO_CREATOR", "USER", "TESTER", "ADMIN"]) {
    const profile = { role, displayName: "Zakladatel ChytnuCz", badge: "Founder & Owner", identity: { role: "OWNER" } };
    const access = resolveAccess("ordinary", profile, "founder", Date.now(), "expert");
    assert.equal(collaboratorIdentity(access), null);
  }
  assert.equal(collaboratorIdentity({ role: "OWNER", suspended: true }), null);
  assert.equal(collaboratorIdentity(null), null);
});

test("principal configuration requires distinct exact server UIDs and denies invalid values", () => {
  const env = { CHYTNU_OWNER_UID: " founder ", CHYTNU_CO_CREATOR_UID: "expert" };
  assert.equal(configuredOwnerUid(env), "founder"); assert.equal(configuredCoCreatorUid(env), "expert");
  assert.equal(resolveAccess("founder-other", {}, configuredOwnerUid(env), Date.now(), configuredCoCreatorUid(env)).role, "USER");
  assert.equal(resolveAccess("expert-other", {}, configuredOwnerUid(env), Date.now(), configuredCoCreatorUid(env)).role, "USER");
  assert.throws(() => configuredCoCreatorUid({ CHYTNU_OWNER_UID: "same", CHYTNU_CO_CREATOR_UID: "same" }));
  assert.throws(() => configuredOwnerUid({ CHYTNU_OWNER_UID: "bad/uid" }));
  assert.throws(() => configuredCoCreatorUid({ CHYTNU_CO_CREATOR_UID: "bad/uid" }));
});
