import test from "node:test";
import assert from "node:assert/strict";
import { AI_FEATURES, requestAiTask } from "./aiPolicy.js";
import { analyzeDiary } from "./diaryAnalysis.js";
import { approveStoryDraft, createStoryDraft } from "./storyDraft.js";
import { stripJpegMetadata } from "../../shared/media/jpegMetadata.js";
const consent = { version: 1, provider: "test-provider", grantedAt: "2026-11-04T10:00:00Z", capabilities: { stories: true } };

test("AI disabled and missing/revoked/provider-mismatched consent never read payload or send a request", async () => {
  assert.ok(Object.values(AI_FEATURES).every((flag) => typeof flag === "boolean"));
  const fail = () => assert.fail("must not access personal data");
  assert.deepEqual(await requestAiTask({ capability: "stories", flags: { stories: false }, getPayload: fail, request: fail }), { status: "disabled" });
  for (const value of [null, { ...consent, revokedAt: "now" }, { ...consent, provider: "other" }]) {
    assert.deepEqual(await requestAiTask({ capability: "stories", provider: "test-provider", flags: { stories: true }, consent: value, getPayload: fail, request: fail }), { status: "consent_required" });
  }
});

test("provider outage is independent from the saved catch", async () => {
  assert.deepEqual(await requestAiTask({ capability: "stories", provider: "test-provider", flags: { stories: true }, consent,
    getPayload: () => ({}), request: () => { throw new Error("outage"); } }), { status: "unavailable" });
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

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 10, 69, 120, 105, 102, 71, 80, 83, 0, 0xff, 0xda, 0, 2, 33, 0xff, 0xd9]);

test("JPEG metadata stripping removes EXIF losslessly and rejects unsafe multi-scan/truncated inputs", () => {
  assert.deepEqual(stripJpegMetadata(jpeg), new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 33, 0xff, 0xd9]));
  assert.throws(() => stripJpegMetadata(jpeg.subarray(0, jpeg.length - 1)));
  assert.throws(() => stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 33, 0xff, 0xe1, 0, 2, 0xff, 0xd9])));
});

test("empty, whitespace and historical unknown species markers are missing, never a species count", () => {
  const analysis = analyzeDiary(["", " ", "unknown", "unspecified", "unidentified"].map((speciesKey, index) => ({ id: String(index), caughtAt: "2026-11-04", speciesKey })));
  assert.equal(analysis.providerSummary.missing.species, 5);
  assert.equal(Object.keys(analysis.providerSummary.species).length, 0);
});
