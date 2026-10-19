import assert from "node:assert/strict";
import test from "node:test";
import {
  buildJournalActivity,
  buildJournalYearMonths,
  getCalendarMonthLayout,
  summarizeJournalMonth,
  toCalendarDateKey,
} from "./journalCalendar.js";

const localDate = (year, month, day) => new Date(year, month, day, 12).toISOString();

test("calendar groups catches by catch date and trips by start date, ignoring invalid dates", () => {
  const activity = buildJournalActivity([
    { id: "catch-a", caughtAt: localDate(2026, 9, 17) },
    { id: "catch-b", caughtAt: localDate(2026, 9, 17) },
    { id: "invalid", caughtAt: "not a date" },
  ], [
    { id: "trip-a", startedAt: localDate(2026, 9, 17) },
  ]);

  assert.deepEqual(activity.catchesByDay.get("2026-10-17").map(({ id }) => id), ["catch-a", "catch-b"]);
  assert.deepEqual(activity.tripsByDay.get("2026-10-17").map(({ id }) => id), ["trip-a"]);
  assert.equal(activity.catchesByDay.size, 1);
  assert.equal(toCalendarDateKey("invalid"), null);
});

test("month and year summaries count only activity inside the requested periods", () => {
  const activity = buildJournalActivity([
    { id: "oct-a", caughtAt: localDate(2026, 9, 3) },
    { id: "oct-b", caughtAt: localDate(2026, 9, 17) },
    { id: "nov", caughtAt: localDate(2026, 10, 1) },
  ], [
    { id: "trip-oct", startedAt: localDate(2026, 9, 9) },
    { id: "trip-next-year", startedAt: localDate(2027, 0, 2) },
  ]);

  assert.deepEqual(summarizeJournalMonth(activity.catchesByDay, activity.tripsByDay, 2026, 9), {
    catchCount: 2,
    tripCount: 1,
  });
  assert.deepEqual(buildJournalYearMonths(activity.catchesByDay, activity.tripsByDay, 2026)[9], {
    month: 9,
    catchCount: 2,
    tripCount: 1,
  });
  assert.equal(buildJournalYearMonths(activity.catchesByDay, activity.tripsByDay, 2026)[0].catchCount, 0);
});

test("calendar month layout starts weeks on Monday and handles leap years", () => {
  assert.deepEqual(getCalendarMonthLayout(new Date(2024, 1, 1)), { firstOffset: 3, dayCount: 29 });
  assert.deepEqual(getCalendarMonthLayout(new Date(2026, 9, 1)), { firstOffset: 3, dayCount: 31 });
});
