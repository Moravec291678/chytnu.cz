import assert from "node:assert/strict";
import test from "node:test";
import { CLOUDFLARE_ZERO_COST_MODEL, createCloudflareTextProvider } from "./cloudflareProvider.js";

const configuration = { accountId: "a".repeat(32), apiToken: "test-only-token-for-cloudflare", model: CLOUDFLARE_ZERO_COST_MODEL };
const story = { notes: "Ranní rybaření.", action: "title" };
const suggestion = { text: "Ranní příběh" };
const reply = (output, changes = {}) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) }, ...changes }] }),
  { headers: { "content-type": "application/json" } });

test("HTTP rejection, refusal, truncation, invalid JSON, stream overflow and timeout fail without retry", async () => {
  const cases = [
    async () => new Response("provider error with private content", { status: 429 }),
    async () => reply(suggestion, { finish_reason: "length" }),
    async () => reply(suggestion, { message: { refusal: "declined", content: "{}" } }),
    async () => new Response("{"),
    async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "not json" } }] })),
    async () => new Response("x".repeat(32_769)),
    async () => new Response("{}", { headers: { "content-length": "100000" } }),
    async () => { throw new Error("secret-token and private URL"); },
    async () => { throw new DOMException("provider timeout", "TimeoutError"); },
  ];
  for (const response of cases) {
    let calls = 0;
    const provider = createCloudflareTextProvider({ ...configuration, fetchImpl: async () => { calls++; return response(); } });
    await assert.rejects(provider(story), (error) => {
      assert.equal(error.message, "AI provider unavailable.");
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("text assistance returns a draft with the original untouched and validates bounded output", async () => {
  const notes = "Ráno jsem u vody chytil kapra a pustil ho.";
  let calls = 0;
  const provider = createCloudflareTextProvider({ ...configuration, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).messages[1].content, JSON.stringify({ notes }));
    return reply({ text: "Ranní setkání s kaprem" });
  } });
  const draft = await provider({ notes, action: "title" });
  assert.equal(draft.originalNotes, notes);
  assert.equal(draft.status, "draft");
  assert.equal(draft.requiresFactReview, true);
  assert.equal(notes, "Ráno jsem u vody chytil kapra a pustil ho.");
  await assert.rejects(provider({ notes: "ě".repeat(6001), action: "improve" }), TypeError);
  await assert.rejects(provider({ notes, action: "publish" }), TypeError);
  assert.equal(calls, 1);
  const invalid = createCloudflareTextProvider({ ...configuration, fetchImpl: async () => reply({ text: "text", inventedCatch: 42 }) });
  await assert.rejects(invalid({ notes, action: "improve" }), TypeError);
});

test("daily allocation exhaustion closes the shared quota; capacity rejection does not, and callback failure still fails closed", async () => {
  let blocked = 0;
  const provider = createCloudflareTextProvider({ ...configuration, onQuotaExhausted: async () => { blocked++; },
    fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 3036, message: "Daily allocation exhausted" }] }), { status: 429 }) });
  await assert.rejects(provider(story), /AI provider unavailable/);
  assert.equal(blocked, 1);
  const capacity = createCloudflareTextProvider({ ...configuration, onQuotaExhausted: async () => { blocked++; },
    fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 3040 }] }), { status: 429 }) });
  await assert.rejects(capacity(story), /AI provider unavailable/);
  assert.equal(blocked, 1);
  const failedBlock = createCloudflareTextProvider({ ...configuration, onQuotaExhausted: async () => { throw new Error("database unavailable"); },
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: "3036" } }), { status: 429 }) });
  await assert.rejects(failedBlock(story), (error) => error.message === "AI provider unavailable.");
});

test("analysis provider accepts only privacy-reduced summary and validates evidence fields", async () => {
  const { createCloudflareAnalysisProvider } = await import("./cloudflareProvider.js");
  let calls = 0;
  const provider = createCloudflareAnalysisProvider({ ...configuration, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).messages[1].content, JSON.stringify({ count: 2, species: { commonCarp: 1 } }));
    return reply({ text: "Zapsal jsi dva úlovky. Návrh je hypotéza.", evidenceKeys: ["count"] });
  } });
  const result = await provider({ task: "recommendations", summary: { count: 2, species: { commonCarp: 1 } } });
  assert.deepEqual(result.evidenceKeys, ["count"]);
  await assert.rejects(provider({ task: "recommendations", summary: { count: 2, notes: "private" } }), TypeError);
  assert.equal(calls, 1);
  const invalid = createCloudflareAnalysisProvider({ ...configuration, fetchImpl: async () => reply({ text: "Invented", evidenceKeys: ["weather"] }) });
  await assert.rejects(invalid({ task: "recommendations", summary: { count: 2 } }), TypeError);
});

test("safe provider codes distinguish authorization, capacity, allocation, timeout and malformed output", async () => {
  const cases = [[401, 10000, "provider_auth"], [403, 5035, "provider_configuration"], [429, 3040, "provider_capacity"],
    [429, 3036, "provider_quota"], [408, 3007, "provider_timeout"]];
  for (const [status, code, expected] of cases) {
    let calls = 0;
    const provider = createCloudflareTextProvider({ ...configuration, fetchImpl: async () => {
      calls++; return new Response(JSON.stringify({ success: false, errors: [{ code, message: "PRIVATE_NOT_LOGGED" }] }), { status });
    } });
    await assert.rejects(provider(story), error => error.aiCode === expected && error.message === "AI provider unavailable." && !error.message.includes("PRIVATE"));
    assert.equal(calls, 1);
  }
  const bad = createCloudflareTextProvider({ ...configuration, fetchImpl: async () => reply(suggestion, { finish_reason: "length" }) });
  await assert.rejects(bad(story), error => error.aiCode === "invalid_ai_response");
});

test("provider usage comes from the authenticated response, separate from model JSON", async () => {
  const usage = { prompt_tokens: 1200, completion_tokens: 90, total_tokens: 1290 }; let observed;
  const provider = createCloudflareTextProvider({ ...configuration, fetchImpl: async () => new Response(JSON.stringify({ usage,
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(suggestion) } }] }), { headers: { "content-type": "application/json" } }) });
  assert.equal((await provider({ ...story, onUsage: value => { observed = value; } })).text, suggestion.text);
  assert.deepEqual(observed, usage);
});

test("text transport pins the reviewed free model and rejects invalid configuration without dispatch", async () => {
  let calls = 0;
  const provider = createCloudflareTextProvider({ ...configuration, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${configuration.accountId}/ai/v1/chat/completions`);
    assert.equal(options.headers.Authorization, `Bearer ${configuration.apiToken}`);
    const body = JSON.parse(options.body);
    assert.equal(body.model, CLOUDFLARE_ZERO_COST_MODEL);
    assert.equal(body.max_completion_tokens, 512);
    assert.equal(body.store, false);
    assert.equal(typeof body.messages[1].content, "string");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    return reply(suggestion);
  } });
  assert.equal((await provider(story)).text, suggestion.text);
  assert.equal(calls, 1);
  for (const changes of [{ model: "paid-model" }, { accountId: "bad/id" }, { apiToken: "bad\ntoken" }, { timeoutMs: 30000 }]) {
    assert.throws(() => createCloudflareTextProvider({ ...configuration, ...changes }), TypeError);
  }
});
