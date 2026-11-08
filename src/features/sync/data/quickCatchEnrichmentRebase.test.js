import test from "node:test";
import assert from "node:assert/strict";
import { rebaseQuickCatchEnrichment } from "./quickCatchEnrichmentRebase.js";
const record = () => ({ id: "c", ownerId: "owner", captureMode: "quick", caughtAt: "2026-11-08T10:00:00Z", coordinates: { latitude: 50, longitude: 14 },
  photos: [{ id: "p", contentSha256: "a".repeat(64) }], quickCatch: { provenance: {}, environment: { conditions: {} }, enrichment: {} } });
test("remote-first extended weather merge preserves manual values and manual clears across devices", () => {
  const remote = record(), local = record();
  remote.quickCatch.environment.conditions = { humidityPct: 66 };
  remote.quickCatch.provenance = { humidityPct: "manual", cloudCoverPct: "manual" };
  local.quickCatch.environment.conditions = { humidityPct: 80, cloudCoverPct: 25, precipitationMm: 0 };
  local.quickCatch.provenance = { humidityPct: "weather_api", cloudCoverPct: "weather_api", precipitationMm: "weather_api" };
  const merged = rebaseQuickCatchEnrichment(remote, local);
  assert.equal(merged.quickCatch.environment.conditions.humidityPct, 66);
  assert.equal(merged.quickCatch.environment.conditions.cloudCoverPct, undefined);
  assert.equal(merged.quickCatch.environment.conditions.precipitationMm, 0);
  assert.equal(merged.quickCatch.provenance.humidityPct, "manual");
  const changedLocation = { ...remote, coordinates: { latitude: 49, longitude: 15 } };
  assert.deepEqual(rebaseQuickCatchEnrichment(changedLocation, local).quickCatch.environment.conditions, { humidityPct: 66 });
});
