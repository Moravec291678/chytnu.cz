import test from "node:test";
import assert from "node:assert/strict";
import { canOpenAdmin, createAdminClient, hasAdminPermission } from "./adminClient.js";

test("Profile and navigation require server-confirmed active administrator access", () => {
  for (const access of [null, {}, { role: "USER" }, { role: "TESTER" }, { role: "OWNER", suspended: true }]) assert.equal(canOpenAdmin(access), false);
  assert.equal(canOpenAdmin({ role: "OWNER" }), true);
  assert.equal(hasAdminPermission({ role: "ADMIN", permissions: ["tasks"] }, "tasks"), true);
  assert.equal(hasAdminPermission({ role: "ADMIN", permissions: ["tasks"] }, "users.manage"), false);
});

test("admin requests use fresh Firebase authentication, no-store and fixed operation names", async () => {
  let tokens = 0;
  const calls = [];
  const client = createAdminClient({ ownerId: "owner", getOwnerId: () => "owner", getToken: async () => `token-${++tokens}`, endpoint: () => "/api/admin",
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ access: { uid: "owner", role: "OWNER" } }) }; } });
  await client.request("self", { action: "users.update" }); await client.request("self");
  assert.equal(calls[0].url, "/api/admin"); assert.equal(calls[0].options.headers.Authorization, "Bearer token-1");
  assert.equal(calls[1].options.headers.Authorization, "Bearer token-2"); assert.equal(calls[0].options.cache, "no-store");
  assert.equal(JSON.parse(calls[0].options.body).action, "self");
});

test("account switching fences both pending token acquisition and an already-returned response", async () => {
  let currentOwner = "a", calls = 0;
  const client = createAdminClient({ ownerId: "a", getOwnerId: () => currentOwner, getToken: async () => { currentOwner = "b"; return "token"; },
    fetchImpl: async () => { calls++; } });
  await assert.rejects(client.request("self"), { code: "account_changed" }); assert.equal(calls, 0);
  currentOwner = "a";
  const late = createAdminClient({ ownerId: "a", getOwnerId: () => currentOwner, getToken: async () => "token", fetchImpl: async () => {
    currentOwner = "b"; return { ok: true, json: async () => ({ users: [{ uid: "private-account" }] }) };
  } });
  await assert.rejects(late.request("users.list"), { code: "account_changed" });
});

test("revoked administrator and provider failures never turn into a successful UI response or expose raw diagnostics", async () => {
  const client = createAdminClient({ ownerId: "a", getOwnerId: () => "a", getToken: async () => "token",
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: "forbidden", detail: "private credential detail" }) }) });
  await assert.rejects(client.request("users.update"), error => error.code === "forbidden" && !error.message.includes("credential"));
  const switched = createAdminClient({ ownerId: "a", getOwnerId: () => "a", getToken: async () => "token",
    fetchImpl: async () => ({ ok: true, json: async () => ({ access: { uid: "b", role: "OWNER" } }) }) });
  await assert.rejects(switched.request("self"), { code: "account_changed" });
});
