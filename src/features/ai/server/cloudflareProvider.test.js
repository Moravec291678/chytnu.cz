import assert from "node:assert/strict";
import test from "node:test";
import { AI_FEATURES } from "../aiPolicy.js";
import { CLOUDFLARE_ZERO_COST_MODEL, createCloudflareSpeciesProvider, createCloudflareTextProvider } from "./cloudflareProvider.js";

const configuration = { accountId: "a".repeat(32), apiToken: "test-only-token-for-cloudflare", model: CLOUDFLARE_ZERO_COST_MODEL };
const image = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), mimeType: "image/jpeg" };
const suggestion = { status: "suggestion", speciesKey: "commonCarp", confidence: 0.8, alternatives: [], fishCount: 1 };
const reply = (output, changes = {}) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) }, ...changes }] }),
  { headers: { "content-type": "application/json" } });

test("Cloudflare adapter pins a real free-eligible model and sends one bounded vision request", async () => {
  let calls = 0;
  const provider = createCloudflareSpeciesProvider({ ...configuration, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${configuration.accountId}/ai/v1/chat/completions`);
    assert.equal(options.headers.Authorization, `Bearer ${configuration.apiToken}`);
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, CLOUDFLARE_ZERO_COST_MODEL);
    assert.equal(body.max_completion_tokens, 512);
    assert.equal(body.stream, false);
    assert.equal(body.n, 1);
    assert.equal(body.store, false);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(body.options, { rejectIfBusy: true });
    const parts = body.messages[1].content;
    assert.equal(parts[0].type, "text");
    assert.equal(parts[1].type, "image_url");
    assert.match(parts[1].image_url.url, /^data:image\/jpeg;base64,/);
    assert.ok(body.messages[0].content.includes("commonCarp"));
    assert.ok(body.messages[0].content.includes("Cyprinus carpio"));
    assert.equal("user" in body, false);
    return reply(suggestion);
  } });
  assert.deepEqual(await provider(image), suggestion);
  assert.equal(calls, 1);
  assert.equal(typeof AI_FEATURES.species, "boolean");
});

test("unsupported model/account/token/timeout and invalid image never dispatch", async () => {
  const fail = async () => assert.fail("External request must not happen");
  for (const changes of [{ model: "@cf/deepseek-ai/deepseek-v4.1-flash-1017" }, { model: "gemini" },
    { accountId: "bad/id" }, { apiToken: "invalid\ntoken" }, { timeoutMs: 30_000 }]) {
    assert.throws(() => createCloudflareSpeciesProvider({ ...configuration, fetchImpl: fail, ...changes }), TypeError);
  }
  const provider = createCloudflareSpeciesProvider({ ...configuration, fetchImpl: fail });
  for (const value of [{ bytes: "bad", mimeType: "image/jpeg" }, { bytes: new Uint8Array(), mimeType: "image/jpeg" },
    { bytes: new Uint8Array(2 * 1024 * 1024 + 1), mimeType: "image/jpeg" }, { ...image, mimeType: "image/svg+xml" }]) {
    await assert.rejects(provider(value), TypeError);
  }
});

test("model output remains a suggestion, multiple fish become unknown, and invalid catalogue IDs fail", async () => {
  const multiple = createCloudflareSpeciesProvider({ ...configuration, fetchImpl: async () => reply({ ...suggestion, fishCount: 2 }) });
  assert.deepEqual(await multiple(image), { status: "unknown", speciesKey: null, confidence: null, alternatives: [], fishCount: 2 });
  const invalid = createCloudflareSpeciesProvider({ ...configuration, fetchImpl: async () => reply({ ...suggestion, speciesKey: "invented" }) });
  await assert.rejects(invalid(image), TypeError);
});

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
    const provider = createCloudflareSpeciesProvider({ ...configuration, fetchImpl: async () => { calls++; return response(); } });
    await assert.rejects(provider(image), (error) => {
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
  const provider = createCloudflareSpeciesProvider({ ...configuration, onQuotaExhausted: async () => { blocked++; },
    fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 3036, message: "Daily allocation exhausted" }] }), { status: 429 }) });
  await assert.rejects(provider(image), /AI provider unavailable/);
  assert.equal(blocked, 1);
  const capacity = createCloudflareSpeciesProvider({ ...configuration, onQuotaExhausted: async () => { blocked++; },
    fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 3040 }] }), { status: 429 }) });
  await assert.rejects(capacity(image), /AI provider unavailable/);
  assert.equal(blocked, 1);
  const failedBlock = createCloudflareSpeciesProvider({ ...configuration, onQuotaExhausted: async () => { throw new Error("database unavailable"); },
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: "3036" } }), { status: 429 }) });
  await assert.rejects(failedBlock(image), (error) => error.message === "AI provider unavailable.");
});

test("analysis provider accepts only privacy-reduced summary and validates evidence fields", async () => {
  const { createCloudflareAnalysisProvider } = await import("./cloudflareProvider.js");
  let calls = 0;
  const provider = createCloudflareAnalysisProvider({ ...configuration, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).messages[1].content, JSON.stringify({ count: 2, species: { commonCarp: 1 } }));
    return reply({ text: "Zapsal jsi dva úlovky. Návrh je hypotéza.", evidenceKeys: ["count"] });
  } });
  const result = await provider({ task: "diary", summary: { count: 2, species: { commonCarp: 1 } } });
  assert.deepEqual(result.evidenceKeys, ["count"]);
  await assert.rejects(provider({ task: "diary", summary: { count: 2, notes: "private" } }), TypeError);
  assert.equal(calls, 1);
  const invalid = createCloudflareAnalysisProvider({ ...configuration, fetchImpl: async () => reply({ text: "Invented", evidenceKeys: ["weather"] }) });
  await assert.rejects(invalid({ task: "recommendations", summary: { count: 2 } }), TypeError);
});

test("safe provider codes distinguish authorization, capacity, allocation, timeout and malformed output", async () => {
  const cases = [[401, 10000, "provider_auth"], [403, 5035, "provider_configuration"], [429, 3040, "provider_capacity"],
    [429, 3036, "provider_quota"], [408, 3007, "provider_timeout"]];
  for (const [status, code, expected] of cases) {
    let calls = 0;
    const provider = createCloudflareSpeciesProvider({ ...configuration, fetchImpl: async () => {
      calls++; return new Response(JSON.stringify({ success: false, errors: [{ code, message: "PRIVATE_NOT_LOGGED" }] }), { status });
    } });
    await assert.rejects(provider(image), error => error.aiCode === expected && error.message === "AI provider unavailable." && !error.message.includes("PRIVATE"));
    assert.equal(calls, 1);
  }
  const bad = createCloudflareSpeciesProvider({ ...configuration, fetchImpl: async () => reply(suggestion, { finish_reason: "length" }) });
  await assert.rejects(bad(image), error => error.aiCode === "invalid_ai_response");
});

test("Home interpretation uses bounded anonymous numeric evidence and rejects fabricated numeric prose", async () => {
  const { createCloudflareHomeProvider } = await import("./cloudflareProvider.js");
  const summary = { version: "personal-fishing-v1", recordCount: 12, candidates: [{ candidate: 1, family: "species-method-time", numbers: { countA: 8, countB: 4 }, evidenceCount: 12, limitation: "Recorded catches only." }] };
  let calls = 0;
  const provider = createCloudflareHomeProvider({ ...configuration, fetchImpl: async (url, init) => {
    calls++; const body = JSON.parse(init.body);
    assert.equal(body.messages[1].content, JSON.stringify(summary));
    return reply({ text: "Souvislost může odrážet volbu místa nebo délku lovu. Porovnej podobně dlouhé výpravy se stejnou metodou." });
  } });
  assert.match((await provider({ summary })).text, /může/);
  await assert.rejects(provider({ summary: { ...summary, notes: "private" } }), TypeError);
  assert.equal(calls, 1);
  const fabricated = createCloudflareHomeProvider({ ...configuration, fetchImpl: async () => reply({ text: "Úspěšnost je 90 %." }) });
  await assert.rejects(fabricated({ summary }), error => error.aiCode === "invalid_ai_response");
});
