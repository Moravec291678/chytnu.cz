import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFishActivity,
  getActivityLabel,
  getPersonalCatchTimePattern,
  getUserLocation,
} from "./fishActivity.js";
import { clearWeatherCache, fetchWeatherData, getWeatherConditions } from "./weatherApi.js";

test("weather snapshot combines the current hour with complete provider data", () => {
  const conditions = getWeatherConditions({
    current: {
      time: "2026-10-16T10:15",
      temperature_2m: 12,
      wind_speed_10m: 8,
      surface_pressure: 1015,
      cloud_cover: 65,
    },
    hourly: {
      time: ["2026-10-16T09:00", "2026-10-16T10:00"],
      precipitation_probability: [15, 35],
    },
    daily: { sunrise: ["2026-10-16T07:00"], sunset: ["2026-10-16T18:00"] },
    timezone: "Europe/Prague",
    timezone_abbreviation: "CEST",
  });

  assert.deepEqual(conditions, {
    temperature: 12,
    windSpeed: 8,
    pressure: 1015,
    cloudiness: 65,
    rainChance: 35,
    sunrise: "2026-10-16T07:00",
    sunset: "2026-10-16T18:00",
    currentTime: "2026-10-16T10:15",
    timezone: "Europe/Prague",
    timezoneAbbreviation: "CEST",
  });
});

test("weather snapshot rejects missing hourly or non-numeric values", () => {
  assert.throws(() => getWeatherConditions({}), { kind: "weather-unavailable" });

  assert.throws(() => getWeatherConditions({
    current: { time: "2026-10-16T10:15", temperature_2m: 12, wind_speed_10m: 8, surface_pressure: 1015, cloud_cover: 65 },
    hourly: { time: ["2026-10-16T09:00"], precipitation_probability: [15] },
    daily: { sunrise: ["2026-10-16T07:00"], sunset: ["2026-10-16T18:00"] },
  }), { kind: "weather-unavailable" });
});

test("weather snapshot rejects physically implausible values instead of scoring them", () => {
  const data = {
    current: { time: "2026-10-16T10:15", temperature_2m: 12, wind_speed_10m: 8, surface_pressure: 1015, cloud_cover: 65 },
    hourly: { time: ["2026-10-16T10:00"], precipitation_probability: [35] },
    daily: { sunrise: ["2026-10-16T07:00"], sunset: ["2026-10-16T18:00"] },
  };
  assert.throws(() => getWeatherConditions({ ...data, hourly: { ...data.hourly, precipitation_probability: [150] } }), { kind: "weather-unavailable" });
  assert.throws(() => getWeatherConditions({ ...data, current: { ...data.current, surface_pressure: -2 } }), { kind: "weather-unavailable" });
});

test("geolocation denial is preserved as a permission error", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { geolocation: { getCurrentPosition(_success, failure) { failure({ code: 1 }); } } },
  });
  try {
    await assert.rejects(getUserLocation(), { code: 1 });
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
});

test("activity heuristic is deterministic for the same weather and timestamp", () => {
  const conditions = { temperature: -5, windSpeed: 40, pressure: 1000, cloudiness: 0, rainChance: 0 };
  const date = new Date(2026, 0, 16, 2);
  const activity = calculateFishActivity(conditions, date);
  assert.equal(activity.score, 27);
  assert.equal(activity.factors.length, 8);
  assert.equal(activity.factors.reduce((total, factor) => total + factor.weight, 0), 1);
  assert.deepEqual(calculateFishActivity(conditions, date), activity);
});

test("activity labels use the reference 0-to-100 score scale", () => {
  assert.deepEqual(getActivityLabel(80), { label: "Podmínky vycházejí příznivě", color: "green" });
  assert.deepEqual(getActivityLabel(60), { label: "Podmínky vypadají příznivě", color: "yellow" });
  assert.deepEqual(getActivityLabel(40), { label: "Podmínky jsou smíšené", color: "orange" });
  assert.deepEqual(getActivityLabel(39), { label: "Podmínky vycházejí méně příznivě", color: "red" });
});

test("personal activity time pattern derives only valid catch timestamps", () => {
  assert.deepEqual(getPersonalCatchTimePattern([
    { caughtAt: "2026-10-16T06:15:00" },
    { caughtAt: "2026-10-16T08:45:00" },
    { caughtAt: "2026-10-16T15:00:00" },
    { caughtAt: "invalid" },
  ]), { labels: ["06–09 h"], count: 2, sampleCount: 3 });
  assert.equal(getPersonalCatchTimePattern([]), null);
});

test("weather request reports HTTP failures as unavailable data", async () => {
  clearWeatherCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });

  try {
    await assert.rejects(fetchWeatherData(50, 14), { kind: "weather-unavailable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("weather response is cached in memory briefly and expires", async () => {
  clearWeatherCache();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    calls += 1;
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({
        current: { time: "2026-10-16T10:15", temperature_2m: 12, wind_speed_10m: 8, surface_pressure: 1015, cloud_cover: 65 },
        hourly: { time: ["2026-10-16T10:00"], precipitation_probability: [35] },
        daily: { sunrise: ["2026-10-16T07:00"], sunset: ["2026-10-16T18:00"] },
        timezone: "Europe/Prague",
        timezone_abbreviation: "CEST",
      }),
    };
  };
  try {
    const first = await fetchWeatherData(50, 14, { now: 1_000 });
    const second = await fetchWeatherData(50, 14, { now: 2_000 });
    const expired = await fetchWeatherData(50, 14, { now: 302_000 });
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(expired.cached, false);
    assert.equal(calls, 2);
    assert.match(requestedUrl, /hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,precipitation_probability/);
  } finally {
    globalThis.fetch = originalFetch;
    clearWeatherCache();
  }
});

test("invalid coordinates are rejected before any network call", async () => {
  await assert.rejects(fetchWeatherData(95, 14), { kind: "location-unavailable" });
});
