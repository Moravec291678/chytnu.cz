import test from "node:test";
import assert from "node:assert/strict";
import { getFishActivityForecast } from "./fishActivityForecast.js";

function localDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

function forecastFixture() {
  const start = new Date(2026, 9, 16, 10);
  const time = Array.from({ length: 49 }, (_, index) => {
    const date = new Date(start);
    date.setHours(date.getHours() + index);
    return localDateTime(date);
  });
  return {
    current: { time: time[0] },
    hourly: {
      time,
      temperature_2m: time.map(() => 12),
      wind_speed_10m: time.map(() => 8),
      surface_pressure: time.map(() => 1015),
      cloud_cover: time.map(() => 65),
      precipitation_probability: time.map(() => 35),
    },
  };
}

test("weather forecast calculates eight six-hour samples from the real hourly response", () => {
  const forecast = getFishActivityForecast(forecastFixture());

  assert.equal(forecast.length, 8);
  assert.deepEqual(forecast.map(({ label }) => label), [
    "10:00", "16:00", "22:00", "04:00", "10:00", "16:00", "22:00", "04:00",
  ]);
  assert.ok(forecast.every(({ score }) => Number.isInteger(score) && score >= 0 && score <= 100));
});

test("forecast omits unavailable hourly conditions rather than fabricating a score", () => {
  const data = forecastFixture();
  delete data.hourly.cloud_cover;
  assert.deepEqual(getFishActivityForecast(data), []);

  const incomplete = forecastFixture();
  incomplete.hourly.wind_speed_10m[6] = null;
  assert.equal(getFishActivityForecast(incomplete).length, 7);
});
