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
    { id: "catch-b", caughtAt: "2026-10-17T13:00:00+02:00" },
    { id: "catch-a", caughtAt: "2026-10-17T11:00:00+02:00" },
    { id: "invalid", caughtAt: "not a date" },
  ], [
    { id: "trip-a", startedAt: localDate(2026, 9, 17) },
  ]);

  assert.deepEqual(activity.catchesByDay.get("2026-10-17").map(({ id }) => id), ["catch-b", "catch-a"]);
  assert.deepEqual(activity.tripsByDay.get("2026-10-17").map(({ id }) => id), ["trip-a"]);
  assert.equal(activity.catchesByDay.size, 1);
  assert.equal(toCalendarDateKey("invalid"), null);
});

test("explicit timestamps use Europe/Prague dates across midnight, month and year boundaries", () => {
  assert.equal(toCalendarDateKey("2026-03-29T22:30:00.000Z"), "2026-03-30");
  assert.equal(toCalendarDateKey("2026-10-31T23:30:00.000Z"), "2026-11-01");
  assert.equal(toCalendarDateKey("2026-12-31T23:30:00.000Z"), "2027-01-01");
  assert.equal(toCalendarDateKey("2026-01-01"), "2026-01-01");
  assert.equal(toCalendarDateKey("2026-02-30"), null);
});

test("today and historical date-only values keep their Prague calendar day", () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  assert.equal(toCalendarDateKey(new Date()), formatter.format(new Date()));
  assert.equal(toCalendarDateKey("2024-02-29"), "2024-02-29");
});

test("Prague-local month and year summaries keep boundary catches in their displayed period", () => {
  const activity = buildJournalActivity([
    { id: "november-catch", caughtAt: "2026-10-31T23:30:00.000Z" },
    { id: "year-boundary", caughtAt: "2026-12-31T23:30:00.000Z" },
  ], []);

  assert.deepEqual([...activity.catchesByDay.keys()], ["2026-11-01", "2027-01-01"]);
  assert.deepEqual(summarizeJournalMonth(activity.catchesByDay, activity.tripsByDay, 2026, 10), {
    catchCount: 1,
    tripCount: 0,
  });
  assert.deepEqual(summarizeJournalMonth(activity.catchesByDay, activity.tripsByDay, 2026, 11), {
    catchCount: 0,
    tripCount: 0,
  });
  assert.equal(buildJournalYearMonths(activity.catchesByDay, activity.tripsByDay, 2027)[0].catchCount, 1);
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
