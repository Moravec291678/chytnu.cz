import test from "node:test";
import assert from "node:assert/strict";
import { clearCatchWeatherCache, fetchCatchWeather, replaceAutomaticConditions } from "./catchWeather.js";

test("weather fills blank values and never overwrites user-edited fields", () => {
  assert.deepEqual(
    replaceAutomaticConditions({ airTempC: "", pressureHpa: "manual", waterTempC: "" }, {}, { airTempC: 12, pressureHpa: 1008, windKmh: 5 }, new Set(["pressureHpa"])),
    { airTempC: 12, pressureHpa: "manual", waterTempC: "", windKmh: 5 },
  );
});

test("automatic weather refresh replaces previous automatic values but keeps manual fields", () => {
  assert.deepEqual(
    replaceAutomaticConditions({ airTempC: 12, windKmh: "manual", pressureHpa: "" }, { airTempC: 12 }, { airTempC: 9, pressureHpa: 1013 }, new Set(["windKmh"])),
    { airTempC: 9, windKmh: "manual", pressureHpa: 1013 },
  );
});

test("historical catch uses archive data for its requested hour, never current weather", async () => {
  clearCatchWeatherCache();
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(new URL(url));
    return { ok: true, json: async () => ({ hourly: {
      time: ["2020-02-03T10:00", "2020-02-03T11:00"],
      temperature_2m: [4, 5], surface_pressure: [1001, 1002], wind_speed_10m: [7, 8],
    } }) };
  };
  try {
    const values = await fetchCatchWeather(50, 14, "2020-02-03", "10:20", { now: new Date("2026-10-20T10:00:00") });
    assert.equal(requested.length, 1);
    assert.equal(requested[0].hostname, "archive-api.open-meteo.com");
    assert.equal(requested[0].searchParams.get("start_date"), "2020-02-03");
    assert.deepEqual(values, { airTempC: 4, pressureHpa: 1001, windKmh: 7 });
  } finally {
    globalThis.fetch = originalFetch;
    clearCatchWeatherCache();
  }
});

test("weather failures reject without producing placeholder values", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try {
    await assert.rejects(fetchCatchWeather(50, 14, "2020-02-03", "10:00", { now: new Date("2026-10-20") }), /není dostupné/);
  } finally {
    globalThis.fetch = originalFetch;
    clearCatchWeatherCache();
  }
});
