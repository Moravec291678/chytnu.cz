import test from "node:test";
import assert from "node:assert/strict";
import { getMonthlyCatchSeries, getPeriodLabel, getPeriodRange } from "./statsPeriod.js";

test("season statistics cover the fishing season from March through the current month", () => {
  const date = new Date(2026, 9, 16);
  const [start, end] = getPeriodRange("season", date);

  assert.deepEqual([start.getFullYear(), start.getMonth(), start.getDate()], [2026, 2, 1]);
  assert.deepEqual([end.getFullYear(), end.getMonth(), end.getDate()], [2026, 10, 1]);
  assert.equal(getPeriodLabel("season", date), "Sezóna 2026 · březen až říjen");
});

test("season selection in January and February continues the previous fishing season", () => {
  const date = new Date(2027, 0, 12);
  const [start, end] = getPeriodRange("season", date);

  assert.deepEqual([start.getFullYear(), start.getMonth(), start.getDate()], [2026, 2, 1]);
  assert.deepEqual([end.getFullYear(), end.getMonth(), end.getDate()], [2027, 1, 1]);
  assert.equal(getPeriodLabel("season", date), "Sezóna 2026–2027 · březen až leden");
});

test("year and all-time options retain their own range and label", () => {
  const date = new Date(2026, 9, 16);
  const [start, end] = getPeriodRange("year", date);

  assert.deepEqual([start.getFullYear(), start.getMonth()], [2026, 0]);
  assert.deepEqual([end.getFullYear(), end.getMonth()], [2027, 0]);
  assert.equal(getPeriodRange("total", date), null);
  assert.equal(getPeriodLabel("year", date), "Rok 2026");
  assert.equal(getPeriodLabel("total", date), "Za celou dobu");
});

test("monthly series follows the selected season and excludes dates outside it", () => {
  const series = getMonthlyCatchSeries([
    { caughtAt: "2026-03-12T12:00:00.000Z" },
    { caughtAt: "2026-10-12T12:00:00.000Z" },
    { caughtAt: "2026-02-12T12:00:00.000Z" },
    { caughtAt: "invalid" },
  ], "season", new Date(2026, 9, 16));

  assert.equal(series.months.length, 8);
  assert.deepEqual(series.months.map(({ count }) => count), [1, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(series.datedCatchCount, 2);
});

test("all-time chart displays a rolling six-month window without losing full-period totals", () => {
  const series = getMonthlyCatchSeries([
    { caughtAt: "2026-05-12T12:00:00.000Z" },
    { caughtAt: "2026-03-12T12:00:00.000Z" },
  ], "total", new Date(2026, 9, 16));

  assert.equal(series.months.length, 6);
  assert.deepEqual(series.months.map(({ count }) => count), [1, 0, 0, 0, 0, 0]);
  assert.equal(series.datedCatchCount, 1);
});
