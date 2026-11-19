import test from "node:test";
import assert from "node:assert/strict";
import { createAiClient, canApproveAiStory, canDisplayAiResult, validateAiStoryDraft } from "./aiClient.js";

const consent = { version: 1, provider: "cloudflare", grantedAt: "2026-11-04T10:00:00Z", revision: 3,
  capabilities: { species: true, stories: true, diary: true, recommendations: true } };
const flags = { species: false, stories: true, diary: false, recommendations: true };
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const storyResponse = { status: "draft", catchId: "c", task: "improve", originalNotes: "Původní poznámka", text: "Čitelnější poznámka" };
function makeClient(options = {}) {
  const requests = [];
  const client = createAiClient({ ownerId: "owner", getOwnerId: () => "owner", getToken: async () => "test-id-token", flags,
    fetchImpl: async (url, init) => { requests.push({ url, ...init, body: JSON.parse(init.body) }); return response(storyResponse); }, ...options });
  return { client, requests };
}

test("no consent, revoked consent, wrong provider and disabled features prevent token or external request", async () => {
  let tokens = 0, requests = 0;
  for (const value of [null, { ...consent, revokedAt: "2026-11-04" }, { ...consent, provider: "other" }]) {
    const { client } = makeClient({ getToken: async () => { tokens++; return "token"; }, fetchImpl: () => { requests++; } });
    await assert.rejects(client.run("stories", { catchId: "c", task: "improve" }, { consent: value }), { code: "consent_required" });
  }
  const { client } = makeClient({ getToken: () => { tokens++; } });
  await assert.rejects(client.run("species", { catchId: "c", photoId: "p" }, { consent }), { code: "disabled" });
  await assert.rejects(client.run("diary", {}, { consent }), { code: "disabled" });
  assert.equal(tokens, 0); assert.equal(requests, 0);
});

test("story assistance sends only selected catch and task, then validates an approval-only draft", async () => {
  const { client, requests } = makeClient();
  const source = { id: "c", notes: "Původní poznámka" }, before = structuredClone(source);
  const draft = await client.run("stories", { catchId: "c", task: "improve", notes: "PRIVATE", coordinates: "PRIVATE" }, { consent });
  assert.deepEqual(source, before);
  assert.equal(canApproveAiStory(source, draft), true);
  assert.equal(canApproveAiStory({ ...source, notes: "Nová ruční úprava" }, draft), false);
  assert.equal(canApproveAiStory({ ...source, id: "other" }, draft), false);
  assert.equal(canApproveAiStory(source, { ...draft, action: "title" }), false);
  assert.equal(canApproveAiStory({ ...source, sync: { revision: 3 } }, { ...draft, expectedRevision: 3 }), true);
  assert.equal(canApproveAiStory({ ...source, sync: { revision: 4 } }, { ...draft, expectedRevision: 3 }), false);
  assert.deepEqual(requests[0].body, { action: "story", catchId: "c", task: "improve" });
  assert.equal(requests[0].headers.Authorization, "Bearer test-id-token");
  assert.throws(() => validateAiStoryDraft({ ...draft, text: "" }), { code: "invalid_response" });
});

test("authentication failure and API outage expose safe errors without mutating fishing data", async () => {
  for (const [fetchImpl, code] of [[async () => response({ error: "photo_not_ready" }, 422), "photo_not_ready"],
    [async () => { throw new Error("private provider detail"); }, "unavailable"],
    [async () => response({ error: "quota_blocked" }, 429), "quota_exceeded"]]) {
    const { client } = makeClient({ fetchImpl });
    await assert.rejects(client.run("stories", { catchId: "c", task: "improve" }, { consent }), { code });
  }
  const { client } = makeClient({ getToken: async () => null });
  await assert.rejects(client.getConsent(), { code: "unauthenticated" });
});

test("account switches and aborted tasks suppress late successful responses", async () => {
  let owner = "owner";
  const switched = makeClient({ getOwnerId: () => owner, fetchImpl: async () => ({ ok: true, json: async () => { owner = "other"; return storyResponse; } }) });
  await assert.rejects(switched.client.run("stories", { catchId: "c", task: "improve" }, { consent }), { code: "account_changed" });
  const controller = new AbortController();
  const aborted = makeClient({ fetchImpl: async () => { controller.abort(); return response(storyResponse); } });
  await assert.rejects(aborted.client.run("stories", { catchId: "c", task: "improve" }, { consent, signal: controller.signal }), { code: "unavailable" });
});

test("consent update retains strict capability shape and revoke uses a separate action", async () => {
  const requests = [];
  const { client } = makeClient({ fetchImpl: async (url, init) => { requests.push(JSON.parse(init.body)); return response({ consent }); } });
  await client.updateConsent({ stories: true, recommendations: true }, { expectedRevision: 3 });
  await client.revokeConsent();
  assert.deepEqual(requests[0], { action: "consent.update", version: 1, expectedRevision: 3,
    capabilities: { species: false, stories: true, diary: false, recommendations: true } });
  assert.deepEqual(requests[1], { action: "consent.revoke" });
});

test("retained drafts require the same account and exact still-granted consent revision", () => {
  const retained = { ownerId: "owner", consentRevision: 3, catchId: "c", expectedRevision: 1,
    status: "draft", action: "improve", originalNotes: "Původní", text: "Návrh" };
  assert.equal(canDisplayAiResult(retained, { ownerId: "owner", consent, capability: "stories" }), true);
  assert.equal(canDisplayAiResult(retained, { ownerId: "other", consent, capability: "stories" }), false);
  assert.equal(canApproveAiStory({ id: "c", ownerId: "other", notes: "Původní", sync: { revision: 1 } }, retained), false);
  assert.equal(canDisplayAiResult(retained, { ownerId: "owner", consent: { ...consent, revokedAt: "2026-11-05T00:00:00Z" }, capability: "stories" }), false);
  assert.equal(canDisplayAiResult(retained, { ownerId: "owner", consent: { ...consent, revision: 4 }, capability: "stories" }), false);
  assert.equal(canDisplayAiResult({ ...retained, consentRevision: undefined }, { ownerId: "owner", consent, capability: "stories" }), false);
  assert.equal(canDisplayAiResult(retained, { ownerId: "owner", consent, capability: "species" }), false);
});

test("diary recommendations send no raw records and validate bounded evidence", async () => {
  const requests = [];
  const { client } = makeClient({ flags: { ...flags, diary: true },
    fetchImpl: async (url, init) => {
      requests.push(JSON.parse(init.body));
      return response({ status: "generated", text: "Opatrný tip.", summary: { count: 1 }, evidenceIds: ["c"] });
    } });
  assert.equal((await client.run("diary", { records: "PRIVATE" }, { consent })).text, "Opatrný tip.");
  await client.run("recommendations", { records: "PRIVATE" }, { consent });
  assert.deepEqual(requests, [{ action: "diary" }, { action: "recommendations" }]);
  const bad = makeClient({ flags: { ...flags, diary: true }, fetchImpl: async () => response({ text: { html: "bad" } }) });
  await assert.rejects(bad.client.run("diary", {}, { consent }), { code: "invalid_response" });
});

test("token errors never expose authentication diagnostics or private server details", async () => {
  const { client } = makeClient({ getToken: async () => { throw new Error("PRIVATE_AUTH_DIAGNOSTIC"); } });
  await assert.rejects(client.getConsent(), (error) => error.code === "unavailable" && !error.message.includes("PRIVATE"));
});
