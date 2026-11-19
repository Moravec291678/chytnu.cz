import assert from "node:assert/strict";
import test from "node:test";
import { restoreLocalSocialConfig } from "./local-social-api-plugin.js";

test("local social API restores the previous emulator config", async () => {
  const calls = [];
  const previous = { enabled: false, feature: "preserved" };
  await restoreLocalSocialConfig({
    set: async value => calls.push(["set", value]),
    delete: async () => calls.push(["delete"]),
  }, { exists: true, data: () => previous });
  assert.deepEqual(calls, [["set", previous]]);
});

test("local social API removes its temporary config when none existed", async () => {
  const calls = [];
  await restoreLocalSocialConfig({
    set: async value => calls.push(["set", value]),
    delete: async () => calls.push(["delete"]),
  }, { exists: false });
  assert.deepEqual(calls, [["delete"]]);
});
