import assert from "node:assert/strict";
import test from "node:test";
import { normalizeQuickCatchMetadata, quickCatchMetadataFromRemote, quickCatchMetadataToRemote } from "./quickCatchMetadata.js";
import { toRemoteRecord } from "../../sync/data/firestoreSyncAdapter.js";

const metadata = () => ({
  capturedAt: "2026-11-04T10:12:00.000Z", inputSource: "gallery", timeZone: "Europe/Prague", timezoneOffsetMinutes: -60,
  provenance: { caughtAt: "exif", speciesKey: "manual", coordinates: "gps", lengthCm: "manual" },
  enrichment: { metadata: { status: "complete", attempts: 1, nextAttemptAt: null }, weather: { status: "pending", attempts: 0, nextAttemptAt: null } },
});

test("quick catch sync preserves bounded metadata and genuinely unknown measurements/species", () => {
  const record = { id: "quick-1", ownerId: "angler-1", captureMode: "quick", quickCatch: metadata(),
    species: "", speciesKey: "", weightKg: null, lengthCm: null };
  const projected = toRemoteRecord("catch", record, "angler-1");
  assert.equal(projected.captureMode, "quick");
  assert.equal(typeof projected.quickCatch, "string");
  assert.deepEqual(quickCatchMetadataFromRemote(projected.quickCatch), metadata());
  assert.equal(projected.speciesKey, "");
  assert.equal(projected.lengthCm, null);
  assert.equal(projected.weightKg, null);
  assert.equal("quickCatch" in toRemoteRecord("catch", { id: "old", ownerId: "angler-1" }, "angler-1"), false);
});

test("wire metadata round trips without exposing arbitrary content and malformed JSON stays inert", () => {
  assert.deepEqual(quickCatchMetadataFromRemote(quickCatchMetadataToRemote(metadata())), metadata());
  for (const invalid of ["{", "[]", "null", "{}", JSON.stringify({ ...metadata(), capturedAt: "bad" }), "x".repeat(4097), {}, null]) {
    assert.equal(quickCatchMetadataFromRemote(invalid), null);
  }
});

test("metadata projection excludes arbitrary job, provider, photo and provenance payloads", () => {
  const value = metadata();
  value.secret = "provider-key";
  value.provenance.notes = "private text is not a source";
  value.provenance.unsupported = "manual";
  value.enrichment.weather.response = "private weather response";
  value.enrichment.arbitrary = { secret: "provider-key" };
  assert.equal(JSON.stringify(normalizeQuickCatchMetadata(value)).includes("private"), false);
  assert.equal(JSON.stringify(normalizeQuickCatchMetadata(value)).includes("provider-key"), false);
  assert.equal(normalizeQuickCatchMetadata(value).provenance.speciesKey, "manual");
});

test("invalid timestamps, sources, offsets and unbounded jobs are rejected before upload", () => {
  for (const changes of [{ capturedAt: "invalid" }, { inputSource: "fake" }, { timezoneOffsetMinutes: 1000 },
    { timeZone: "x".repeat(101) }, { enrichment: { weather: { status: "pending", attempts: 4, nextAttemptAt: null } } },
    { enrichment: { weather: { status: "pending", attempts: 1, nextAttemptAt: "invalid" } } },
    { enrichment: { weather: { status: "invented", attempts: 0 } } }]) {
    assert.throws(() => normalizeQuickCatchMetadata({ ...metadata(), ...changes }), TypeError);
  }
});
