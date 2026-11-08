import test from "node:test";
import assert from "node:assert/strict";
import { createAiClient, canApproveAiStory, canDisplayAiResult, validateAiStoryDraft } from "./aiClient.js";

const consent = { version: 1, provider: "cloudflare", grantedAt: "2026-11-04T10:00:00Z", revision: 3,
  capabilities: { species: true, stories: true, diary: true, recommendations: true } };
const flags = { species: true, stories: true, diary: true, recommendations: true };
const suggestion = { status: "suggestion", speciesKey: "commonCarp", confidence: 0.8, alternatives: [], fishCount: 1 };
const sourceSha256 = "a".repeat(64);
const serverSuggestion = { ...suggestion, sourceSha256 };
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
function makeClient(options = {}) {
  const requests = [];
  const client = createAiClient({ ownerId: "owner", getOwnerId: () => "owner", getToken: async () => "test-id-token", flags,
    fetchImpl: async (url, init) => { requests.push({ url, ...init, body: JSON.parse(init.body) }); return response(serverSuggestion); }, ...options });
  return { client, requests };
}

test("no consent, revoked consent, wrong provider and disabled flags prevent both token and external request", async () => {
  let tokens = 0, requests = 0;
  for (const value of [null, { ...consent, revokedAt: "2026-11-04" }, { ...consent, provider: "other" }]) {
    const { client } = makeClient({ getToken: async () => { tokens++; return "token"; }, fetchImpl: () => { requests++; } });
    await assert.rejects(client.run("species", { catchId: "c", photoId: "p" }, { consent: value }), { code: "consent_required" });
  }
  const { client } = makeClient({ flags: { species: false }, getToken: () => { tokens++; } });
  await assert.rejects(client.run("species", {}, { consent }), { code: "disabled" });
  assert.equal(tokens, 0); assert.equal(requests, 0);
});

test("species uses existing authenticated endpoint, minimal IDs only and validates model output", async () => {
  const { client, requests } = makeClient();
  assert.deepEqual(await client.run("species", { catchId: "c", photoId: "p", coordinates: "PRIVATE", notes: "PRIVATE", bytes: "PRIVATE" }, { consent }), serverSuggestion);
  assert.equal(requests[0].url, "/api/ai/species");
  assert.deepEqual(requests[0].body, { action: "species", catchId: "c", photoId: "p" });
  assert.equal(requests[0].headers.Authorization, "Bearer test-id-token");
  const bad = makeClient({ fetchImpl: async () => response({ ...suggestion, speciesKey: "invented" }) });
  await assert.rejects(bad.client.run("species", { catchId: "c", photoId: "p" }, { consent }), { code: "invalid_response" });
});

test("auth failure, API outage and unapproved photo fail safely without record mutations", async () => {
  for (const [fetchImpl, code] of [[async () => response({ error: "photo_not_ready" }, 422), "photo_not_ready"],
    [async () => { throw new Error("private provider detail"); }, "unavailable"],
    [async () => response({ error: "quota_blocked" }, 429), "quota_exceeded"]]) {
    const { client } = makeClient({ fetchImpl });
    await assert.rejects(client.run("species", { catchId: "c", photoId: "p" }, { consent }), { code });
  }
  const { client } = makeClient({ getToken: async () => null });
  await assert.rejects(client.getConsent(), { code: "unauthenticated" });
});

test("account switches reject old responses", async () => {
  let owner = "owner";
  const { client } = makeClient({ getOwnerId: () => owner, fetchImpl: async () => { owner = "other"; return response(suggestion); } });
  await assert.rejects(client.run("species", { catchId: "c", photoId: "p" }, { consent }), { code: "account_changed" });
});

test("consent version and optimistic revision prevent accidental broad grants; revoke uses a separate action", async () => {
  const requests = [];
  const { client } = makeClient({ fetchImpl: async (url, init) => { requests.push(JSON.parse(init.body)); return response({ consent }); } });
  await client.updateConsent({ species: true }, { expectedRevision: 3 });
  await client.revokeConsent();
  assert.deepEqual(requests[0], { action: "consent.update", version: 1, expectedRevision: 3,
    capabilities: { species: true, stories: false, diary: false, recommendations: false } });
  assert.deepEqual(requests[1], { action: "consent.revoke" });
});

test("story assistance is a validated draft; stale notes, wrong catch and unapproved title cannot replace notes", async () => {
  const source = { id: "c", notes: "Původní poznámka" };
  const before = structuredClone(source);
  const { client } = makeClient({ fetchImpl: async () => response({ status: "draft", catchId: "c", task: "improve", originalNotes: source.notes, text: "Čitelnější poznámka" }) });
  const draft = await client.run("stories", { catchId: "c", task: "improve" }, { consent });
  assert.deepEqual(source, before);
  assert.equal(canApproveAiStory(source, draft), true);
  assert.equal(canApproveAiStory({ ...source, notes: "Nová ruční úprava" }, draft), false);
  assert.equal(canApproveAiStory({ ...source, id: "other" }, draft), false);
  assert.equal(canApproveAiStory(source, { ...draft, action: "title" }), false);
  assert.equal(canApproveAiStory({ ...source, sync: { revision: 3 } }, { ...draft, expectedRevision: 3 }), true);
  assert.equal(canApproveAiStory({ ...source, sync: { revision: 4 } }, { ...draft, expectedRevision: 3 }), false);
  assert.throws(() => validateAiStoryDraft({ ...draft, text: "" }), { code: "invalid_response" });
});

test("token errors never expose authentication diagnostics or private server details", async () => {
  const { client } = makeClient({ getToken: async () => { throw new Error("PRIVATE_AUTH_DIAGNOSTIC"); } });
  await assert.rejects(client.getConsent(), (error) => error.code === "unavailable" && !error.message.includes("PRIVATE"));
});

test("an account change while parsing the body and an aborted task both suppress a late successful response", async () => {
  let owner = "owner";
  const switched = makeClient({ getOwnerId: () => owner, fetchImpl: async () => ({ ok: true, json: async () => { owner = "other"; return suggestion; } }) });
  await assert.rejects(switched.client.run("species", { catchId: "c", photoId: "p" }, { consent }), { code: "account_changed" });
  const controller = new AbortController();
  const aborted = makeClient({ fetchImpl: async () => { controller.abort(); return response(suggestion); } });
  await assert.rejects(aborted.client.run("species", { catchId: "c", photoId: "p" }, { consent, signal: controller.signal }), { code: "unavailable" });
});

test("consent races and incomplete aggregate evidence fail with reviewable Czech errors", async () => {
  const conflicted = makeClient({ fetchImpl: async () => response({ error: "consent_conflict" }, 409) });
  await assert.rejects(conflicted.client.updateConsent({ species: true }, { expectedRevision: 1 }), (error) => error.code === "consent_conflict" && error.message.includes("jiném zařízení"));
  for (const value of [{ status: "generated", text: "Text bez důkazů." },
    { status: "generated", text: "Nesouhlasí počet.", summary: { count: 3 }, evidenceIds: ["c"] }]) {
    const malformed = makeClient({ fetchImpl: async () => response(value) });
    await assert.rejects(malformed.client.run("diary", {}, { consent }), { code: "invalid_response" });
  }
});

test("species response requires the server-verified original photo hash", async () => {
  for (const value of [suggestion, { ...serverSuggestion, sourceSha256: "invalid" }]) {
    const { client } = makeClient({ fetchImpl: async () => response(value) });
    await assert.rejects(client.run("species", { catchId: "c", photoId: "p" }, { consent }), { code: "invalid_response" });
  }
});

test("revocation cleanup notice preserves the successfully saved revoked consent", async () => {
  const revoked = { ...consent, revokedAt: "2026-11-05T00:00:00Z", revision: 4, capabilities: { species: false, stories: false, diary: false, recommendations: false } };
  const { client } = makeClient({ fetchImpl: async () => response({ consent: revoked, cleanupPending: true }) });
  const result = await client.revokeConsent();
  assert.equal(result.revokedAt, revoked.revokedAt);
  assert.equal(result.cleanupPending, true);
  assert.equal(result.revision, 4);
});

test("retained drafts and explanations require the same account and exact still-granted consent revision", () => {
  const retained = { ownerId: "owner", consentRevision: 3, catchId: "c", expectedRevision: 1,
    status: "draft", action: "improve", originalNotes: "Původní", text: "Návrh" };
  assert.equal(canDisplayAiResult(retained, { ownerId: "owner", consent, capability: "stories" }), true);
  // Same catch ID, local revision, notes and photo on another imported account must not expose old AI content.
  assert.equal(canDisplayAiResult(retained, { ownerId: "other", consent, capability: "stories" }), false);
  assert.equal(canApproveAiStory({ id: "c", ownerId: "other", notes: "Původní", sync: { revision: 1 } }, retained), false);
  assert.equal(canDisplayAiResult(retained, { ownerId: "owner", consent: { ...consent, revokedAt: "2026-11-05T00:00:00Z" }, capability: "stories" }), false);
  assert.equal(canDisplayAiResult(retained, { ownerId: "owner", consent: { ...consent, revision: 4 }, capability: "stories" }), false);
  assert.equal(canDisplayAiResult(retained, { ownerId: "owner", consent: { ...consent, capabilities: { ...consent.capabilities, stories: false } }, capability: "stories" }), false);
  assert.equal(canDisplayAiResult({ ...retained, consentRevision: undefined }, { ownerId: "owner", consent, capability: "diary" }), false);
  assert.equal(canDisplayAiResult({ ...retained, ownerId: "owner" }, { ownerId: "other", consent, capability: "diary" }), false);
});

test("diary and recommendations send no raw journal and reject malformed generated content", async () => {
  const requests = [];
  const { client } = makeClient({ fetchImpl: async (url, init) => { requests.push(JSON.parse(init.body)); return response({ status: "generated", text: "Opatrné vysvětlení.", summary: { count: 1 }, evidenceIds: ["c"] }); } });
  assert.equal((await client.run("diary", { records: "PRIVATE" }, { consent })).text, "Opatrné vysvětlení.");
  await client.run("recommendations", { records: "PRIVATE" }, { consent });
  assert.deepEqual(requests, [{ action: "diary" }, { action: "recommendations" }]);
  const bad = makeClient({ fetchImpl: async () => response({ text: { html: "bad" } }) });
  await assert.rejects(bad.client.run("diary", {}, { consent }), { code: "invalid_response" });
});

test("structured quota errors preserve reset and prohibit pointless retries; automatic consent is explicit", async () => {
  const { AiClientError } = await import("./aiClient.js");
  for (const code of ["user_daily_limit", "app_daily_limit", "text_daily_limit", "provider_quota"]) {
    const error = new AiClientError(code, { retryAt: "2026-11-09T00:00:00Z" });
    assert.equal(error.retryable, false); assert.equal(error.retryAt, "2026-11-09T00:00:00Z");
    assert.doesNotMatch(error.message, /příliš mnoho požadavků/);
  }
  assert.equal(new AiClientError("provider_capacity").retryable, true);
});
