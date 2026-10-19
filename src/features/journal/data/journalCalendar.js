export function toCalendarDateKey(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function groupByDate(records, dateField) {
  const grouped = new Map();
  records.forEach((record) => {
    const key = toCalendarDateKey(record[dateField]);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  });
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
