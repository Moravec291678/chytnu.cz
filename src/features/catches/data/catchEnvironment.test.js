import test from "node:test";
import assert from "node:assert/strict";
import { calculateCatchAstronomy, normalizeCatchEnvironment } from "./catchEnvironment.js";
import { buildCatchEnvironmentPresentation } from "./catchEnvironmentPresentation.js";
import { quickCatchMetadataToRemote, quickCatchMetadataFromRemote } from "./quickCatchMetadata.js";

test("solar approximation uses the catch instant/location with realistic Prague solstice bounds", () => {
  const value = calculateCatchAstronomy("2026-06-21T12:00:00Z", { latitude: 50.0755, longitude: 14.4378 });
  assert.equal(value.daylight, "day");
  assert.ok(Math.abs(Date.parse(value.sunriseAt) - Date.parse("2026-06-21T02:52:00Z")) < 15 * 60000);
  assert.ok(Math.abs(Date.parse(value.sunsetAt) - Date.parse("2026-06-21T19:16:00Z")) < 15 * 60000);
  assert.ok(value.minutesFromSunrise > 500);
  assert.ok(value.moonIlluminationPct >= 0 && value.moonIlluminationPct <= 100);
  assert.equal(calculateCatchAstronomy("2026-06-21T12:00:00Z", null), null);
  assert.equal(calculateCatchAstronomy("invalid", { latitude: 50, longitude: 14 }), null);
  assert.equal(calculateCatchAstronomy("2100-01-01T12:00:00Z", { latitude: 50, longitude: 14 }), null);
});
test("polar conditions do not fabricate sunrise or sunset", () => {
  const summer = calculateCatchAstronomy("2026-06-21T12:00:00Z", { latitude: 89, longitude: 0 });
  const winter = calculateCatchAstronomy("2026-12-21T12:00:00Z", { latitude: 89, longitude: 0 });
  assert.equal(summer.daylight, "polar-day"); assert.equal(winter.daylight, "polar-night");
  assert.equal(summer.sunriseAt, undefined); assert.equal(winter.sunsetAt, undefined);
});
test("strict environment normalization round trips optional metadata and discards raw/invalid values", () => {
  const environment = { conditions: { humidityPct: 75, precipitationMm: 0, cloudCoverPct: 0, windDirectionDeg: 360,
    windGustKmh: 999, weatherCode: 1.5, pressureChange3hHpa: -2, waterTempC: 22 },
    weather: { provider: "open-meteo", kind: "historical-reanalysis", hour: "2020-01-02T10:00:00Z", fetchedAt: "2026-11-08T12:00:00Z", rawResponse: "secret" },
    astronomy: calculateCatchAstronomy("2020-01-02T10:00:00Z", { latitude: 50, longitude: 14 }), raw: "private" };
  const value = normalizeCatchEnvironment(environment);
  assert.equal(value.conditions.precipitationMm, 0);
  assert.equal(value.conditions.windGustKmh, undefined);
  assert.equal(value.conditions.weatherCode, undefined);
  assert.equal(value.conditions.waterTempC, undefined);
  assert.equal(JSON.stringify(value).includes("secret"), false);
  const metadata = { capturedAt: "2026-11-08T12:00:00Z", inputSource: "gallery", environment };
  const roundTrip = quickCatchMetadataFromRemote(quickCatchMetadataToRemote(metadata));
  assert.deepEqual(roundTrip.environment, value);
  assert.ok(quickCatchMetadataToRemote(metadata).length <= 4096);
});
test("presentation preserves real zero weather, omits unknowns and rejects stale astronomy", () => {
  const record = { caughtAt: "2026-11-08T12:00:00Z", conditions: { airTempC: 0, windKmh: null }, quickCatch: {
    environment: { conditions: { precipitationMm: 0, weatherCode: 0 }, astronomy: calculateCatchAstronomy("2020-01-02T10:00:00Z", { latitude: 50, longitude: 14 }) },
    enrichment: { weather: { status: "pending" } } } };
  const result = buildCatchEnvironmentPresentation(record, { online: false });
  assert.match(result.weather.find(([label]) => label === "Vzduch")[1], /0 °C/);
  assert.equal(result.weather.some(([label]) => label === "Vítr"), false);
  assert.equal(result.weather.find(([label]) => label === "Kód počasí WMO")[1], "Jasno");
  assert.deepEqual(result.water, []); assert.deepEqual(result.astronomy, []);
  assert.match(result.status, /připojení/);
});
