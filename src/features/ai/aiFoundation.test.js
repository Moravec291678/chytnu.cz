import test from "node:test";
import assert from "node:assert/strict";
import { AI_FEATURES, requestAiTask } from "./aiPolicy.js";
import { validateSpeciesSuggestion, attachSpeciesSuggestion } from "./speciesSuggestion.js";
import { analyzeDiary } from "./diaryAnalysis.js";
import { approveStoryDraft, createStoryDraft } from "./storyDraft.js";
import { createSpeciesApi } from "./server/speciesApi.js";
import { createGeminiSpeciesProvider } from "./server/geminiProvider.js";
import { createFirebaseSpeciesDependencies, createProductionSpeciesApi, stripJpegMetadata } from "./server/productionSpeciesApi.js";
import { createHash } from "node:crypto";

const consent = { version: 1, provider: "test-provider", grantedAt: "2026-11-04T10:00:00Z", capabilities: { species: true } };
const suggestion = { status: "suggestion", speciesKey: "commonCarp", confidence: 0.86, alternatives: [], fishCount: 1 };

test("AI disabled and missing/revoked/provider-mismatched consent never read payload or send a request", async () => {
  assert.ok(Object.values(AI_FEATURES).every((flag) => typeof flag === "boolean"));
  const fail = () => assert.fail("must not access personal data");
  assert.deepEqual(await requestAiTask({ capability: "species", flags: { species: false }, getPayload: fail, request: fail }), { status: "disabled" });
  for (const value of [null, { ...consent, revokedAt: "now" }, { ...consent, provider: "other" }]) {
    assert.deepEqual(await requestAiTask({ capability: "species", provider: "test-provider", flags: { species: true }, consent: value, getPayload: fail, request: fail }), { status: "consent_required" });
  }
});

test("provider outage is independent from the saved catch", async () => {
  assert.deepEqual(await requestAiTask({ capability: "species", provider: "test-provider", flags: { species: true }, consent,
    getPayload: () => ({}), request: () => { throw new Error("outage"); } }), { status: "unavailable" });
});

test("species schema rejects unknown catalogue IDs, invalid scores, additional measurements and duplicate alternatives", () => {
  assert.deepEqual(validateSpeciesSuggestion(suggestion), suggestion);
  for (const value of [{ ...suggestion, speciesKey: "invented" }, { ...suggestion, confidence: 2 }, { ...suggestion, lengthCm: 90 },
    { ...suggestion, alternatives: [{ speciesKey: "commonCarp", confidence: 0.5 }] }, { ...suggestion, confidence: "0.8" }]) {
    assert.throws(() => validateSpeciesSuggestion(value), TypeError);
  }
  assert.equal(validateSpeciesSuggestion({ ...suggestion, fishCount: 2 }).status, "unknown");
  assert.equal(validateSpeciesSuggestion({ status: "unknown", speciesKey: null, confidence: null, alternatives: [], fishCount: 0 }).speciesKey, null);
});

test("delayed model output cannot overwrite confirmed species, newer edits, changed photo or deletion", () => {
  const record = { id: "c", sync: { revision: 1 }, photos: [{ id: "p" }], speciesKey: null };
  const expected = { expectedPhotoId: "p", expectedRevision: 1 };
  const attached = attachSpeciesSuggestion(record, suggestion, expected);
  assert.equal(attached.speciesKey, null);
  assert.equal(attached.aiSpeciesSuggestion.speciesKey, "commonCarp");
  for (const changed of [{ ...record, speciesKey: "pike" }, { ...record, sync: { revision: 2 } }, { ...record, photos: [] }, { ...record, deleted: true }]) {
    assert.equal(attachSpeciesSuggestion(changed, suggestion, expected), changed);
  }
});

test("diary analysis deduplicates valid records, preserves missing measurements, excludes estimates and sensitive fields", () => {
  const first = { id: "a", caughtAt: "2026-11-04T10:00:00Z", speciesKey: "commonCarp", lengthCm: 60, weightKg: 4, notes: "private", coordinates: { latitude: 50 }, photos: ["secret"] };
  const result = analyzeDiary([first, first, { id: "b", caughtAt: first.caughtAt, lengthCm: null, weightKg: 3, weightSource: "estimated" }, { id: "c", caughtAt: "invalid" }, { ...first, id: "d", deleted: true }]);
  assert.equal(result.providerSummary.count, 2);
  assert.equal(result.providerSummary.meanLengthCm, 60);
  assert.equal(result.providerSummary.missing.length, 1);
  assert.equal(result.providerSummary.missing.species, 1);
  assert.equal(result.providerSummary.missing.measuredWeight, 1);
  assert.equal(result.providerSummary.species.commonCarp, 1);
  assert.equal(result.providerSummary.hours["11"], 2);
  assert.ok(result.providerSummary.limitations.some((line) => line.includes("Small sample")));
  for (const privateValue of ["private", "latitude", "secret", "evidenceIds"]) assert.ok(!JSON.stringify(result.providerSummary).includes(privateValue));
  assert.equal(analyzeDiary([]).providerSummary.longestCm, null);
  assert.throws(() => analyzeDiary([], { from: "bad" }), TypeError);
  assert.equal(analyzeDiary([first], { from: "2026-11-05" }).providerSummary.count, 0);
});

test("stories remain drafts until explicitly approved, and reject stale notes", () => {
  const record = { notes: "Původní zápis.", lengthCm: 60 };
  const draft = createStoryDraft(record.notes, "Upravený zápis.", "improve");
  assert.equal(approveStoryDraft(record, draft, false), record);
  assert.equal(record.notes, "Původní zápis.");
  assert.equal(approveStoryDraft({ ...record, notes: "Nová poznámka" }, draft, true).notes, "Nová poznámka");
  assert.equal(approveStoryDraft(record, draft, true).notes, "Upravený zápis.");
  assert.equal(approveStoryDraft(record, draft, true).lengthCm, 60);
  assert.equal(approveStoryDraft(record, createStoryDraft(record.notes, "Titulek", "title"), true), record);
});

function response() { return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} }; }
const req = { method: "POST", headers: { authorization: "Bearer valid-token" }, body: { catchId: "c", photoId: "p" } };
const dependencies = { enabled: true, providerName: "test-provider", verifyToken: async () => ({ uid: "owner" }), getConsent: async () => consent,
  getOwnedPhoto: async (uid, catchId, photoId) => ({ ownerId: uid, catchId, photoId, bytes: new Uint8Array([1]), mimeType: "image/jpeg", metadataStripped: true }),
  consumeRateLimit: async () => true, provider: async () => suggestion };

test("production-default endpoint is disabled and never invokes a provider", async () => {
  const res = response(); await createSpeciesApi({ provider: () => assert.fail() })(req, res); assert.equal(res.code, 503);
});

test("backend validates auth, owner, limits, consent and output without modifying any record", async () => {
  const cases = [
    [{ ...req, headers: {} }, {}, 401],
    [req, { verifyToken: async () => ({ uid: "a/b" }) }, 401],
    [{ ...req, body: { ...req.body, ownerId: "other" } }, {}, 400],
    [req, { getConsent: async () => null }, 403],
    [req, { consumeRateLimit: async () => false }, 429],
    [req, { getOwnedPhoto: async () => ({ ownerId: "other" }) }, 404],
    [req, { getOwnedPhoto: async () => ({ ownerId: "owner", catchId: "c", photoId: "p", metadataStripped: false }) }, 422],
    [req, { provider: async () => ({ ...suggestion, speciesKey: "fake" }) }, 503],
    [req, {}, 200],
  ];
  for (const [request, override, status] of cases) {
    const res = response(); await createSpeciesApi({ ...dependencies, ...override })(request, res); assert.equal(res.code, status);
  }
});

test("Gemini server transport sends only image plus catalogue, key in header and validates real-response shape", async () => {
  let request;
  const provider = createGeminiSpeciesProvider({ apiKey: "test-only-key", model: "test-model", fetchImpl: async (url, options) => {
    request = { url, options }; return { ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(suggestion) }] } }] }) };
  } });
  assert.deepEqual(await provider({ bytes: new Uint8Array([1, 2]), mimeType: "image/jpeg" }), suggestion);
  assert.ok(!request.url.includes("test-only-key"));
  assert.ok(!request.options.body.includes("test-only-key"));
  assert.ok(!request.options.body.includes("latitude"));
  assert.equal(request.options.headers["x-goog-api-key"], "test-only-key");
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 10, 69, 120, 105, 102, 71, 80, 83, 0, 0xff, 0xda, 0, 2, 33, 0xff, 0xd9]);

test("JPEG metadata stripping removes EXIF losslessly and rejects unsafe multi-scan/truncated inputs", () => {
  assert.deepEqual(stripJpegMetadata(jpeg), new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 33, 0xff, 0xd9]));
  assert.throws(() => stripJpegMetadata(jpeg.subarray(0, jpeg.length - 1)));
  assert.throws(() => stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 33, 0xff, 0xe1, 0, 2, 0xff, 0xd9])));
});

test("real Firebase/Cloudinary dependency wiring scopes data, checks READY/hash/deletion, persists rate caps and strips photo metadata", async () => {
  const documents = new Map([
    ["users/owner/aiPreferences/consent", { ownerId: "owner", ...consent }],
    ["users/owner/catches/c", { id: "c", ownerId: "owner", photoRefs: { p: true } }],
    ["users/owner/catches/c/photos/p", { id: "p", type: "image/jpeg", size: jpeg.length,
      cloud: { state: "synced", provider: "cloudinary", objectKey: "users/owner/catches/c/photos/p/original", sha256: createHash("sha256").update(jpeg).digest("hex") } }],
  ]);
  const snapshot = (path) => ({ exists: documents.has(path), data: () => documents.get(path) });
  const db = { doc: (path) => ({ path, get: async () => snapshot(path) }),
    runTransaction: async (callback) => callback({ get: async (ref) => snapshot(ref.path), set: (ref, value) => documents.set(ref.path, value) }) };
  let fetchCount = 0;
  const deps = createFirebaseSpeciesDependencies({ env: {}, admin: async () => ({ auth: {}, db, Timestamp: { fromMillis: (value) => value } }),
    verifyIdentity: async () => ({ uid: "owner" }), now: () => 1_000,
    cloudinary: async () => ({ utils: { private_download_url: () => "https://api.cloudinary.com/trusted-download" } }),
    fetchImpl: async () => { fetchCount += 1; return new Response(jpeg); } });
  assert.equal((await deps.verifyToken("valid")).uid, "owner");
  assert.equal((await deps.getConsent("owner")).ownerId, "owner");
  assert.equal(await deps.getConsent("another"), null);
  const photo = await deps.getOwnedPhoto("owner", "c", "p");
  assert.ok(photo.metadataStripped);
  assert.ok(photo.bytes.length < jpeg.length);
  assert.equal(await deps.getOwnedPhoto("another", "c", "p"), null);
  assert.equal(fetchCount, 1);
  assert.equal(await deps.consumeRateLimit("owner"), true);
  assert.equal(await deps.consumeRateLimit("owner"), true);
  assert.equal(await deps.consumeRateLimit("owner"), true);
  assert.equal(await deps.consumeRateLimit("owner"), false);
  const storedPhoto = documents.get("users/owner/catches/c/photos/p");
  storedPhoto.cloud.state = "localOnly";
  assert.equal(await deps.getOwnedPhoto("owner", "c", "p"), null);
  assert.equal(fetchCount, 1);
  storedPhoto.cloud.state = "synced";
  storedPhoto.cloud.sha256 = "0".repeat(64);
  await assert.rejects(() => deps.getOwnedPhoto("owner", "c", "p"), /digest/);
  documents.set("accountDeletions/owner", {});
  await assert.rejects(() => deps.verifyToken("valid"));
  assert.equal(await deps.getConsent("owner"), null);
  assert.equal(await deps.getOwnedPhoto("owner", "c", "p"), null);
});

test("production source gate stays disabled even with enabling environment variables", async () => {
  const res = response();
  await createProductionSpeciesApi({ env: { AI_SPECIES_ENABLED: "true", AI_PROVIDER: "gemini", AI_GEMINI_API_KEY: "test-only" } })(req, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.error, "ai_disabled");
});

test("consent revoked while downloading prevents any model request", async () => {
  let reads = 0;
  const res = response();
  await createSpeciesApi({ ...dependencies, getConsent: async () => ++reads === 1 ? consent : { ...consent, revokedAt: "now" }, provider: () => assert.fail() })(req, res);
  assert.equal(res.code, 403);
});

test("empty, whitespace and historical unknown species markers are missing, never a species count", () => {
  const analysis = analyzeDiary(["", " ", "unknown", "unspecified", "unidentified"].map((speciesKey, index) => ({ id: String(index), caughtAt: "2026-11-04", speciesKey })));
  assert.equal(analysis.providerSummary.missing.species, 5);
  assert.equal(Object.keys(analysis.providerSummary.species).length, 0);
});
