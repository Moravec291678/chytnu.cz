const PRAGUE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateKeyFromPragueInstant(date) {
  const parts = Object.fromEntries(PRAGUE_DATE_FORMATTER.formatToParts(date)
    .filter(({ type }) => type !== "literal")
    .map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getDateOnlyParts(value) {
  return /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
}

function isValidDateOnly(match) {
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function toCalendarDateKey(value) {
  const dateOnlyParts = typeof value === "string" ? getDateOnlyParts(value) : null;
  if (dateOnlyParts) return isValidDateOnly(dateOnlyParts) ? value : null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  const date = new Date(timestamp);
  if (typeof value === "string" && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  return dateKeyFromPragueInstant(date);
}

function groupByDate(records, dateField) {
  const grouped = new Map();
  records.forEach((record) => {
    const key = toCalendarDateKey(record[dateField]);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  });
  for (const recordsForDay of grouped.values()) {
    recordsForDay.sort((left, right) => Date.parse(right[dateField]) - Date.parse(left[dateField]));
  }
  return grouped;
}

export function buildJournalActivity(catches, trips) {
  return {
    catchesByDay: groupByDate(catches, "caughtAt"),
    tripsByDay: groupByDate(trips, "startedAt"),
  };
}

export function summarizeJournalMonth(catchesByDay, tripsByDay, year, month) {
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const countInMonth = (grouped) => [...grouped.entries()]
    .filter(([key]) => key.startsWith(monthPrefix))
    .reduce((count, [, records]) => count + records.length, 0);
  return {
    catchCount: countInMonth(catchesByDay),
    tripCount: countInMonth(tripsByDay),
  };
}

export function buildJournalYearMonths(catchesByDay, tripsByDay, year) {
  return Array.from({ length: 12 }, (_, month) => ({
    month,
    ...summarizeJournalMonth(catchesByDay, tripsByDay, year, month),
  }));
}

export function getCalendarMonthLayout(month) {
  return {
    firstOffset: (month.getDay() + 6) % 7,
    dayCount: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
  };
}
