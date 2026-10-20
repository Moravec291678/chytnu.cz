const PRAGUE_TIME_ZONE = "Europe/Prague";

export function getPragueDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function pragueOffsetAt(timestamp) {
  const parts = getPragueDateParts(new Date(timestamp));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - timestamp;
}

function pragueMonthStart(year, monthIndex) {
  const utcMidnight = Date.UTC(year, monthIndex, 1);
  return new Date(utcMidnight - pragueOffsetAt(utcMidnight));
}

function monthLabel(year, monthIndex) {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: PRAGUE_TIME_ZONE, month: "short" })
    .format(new Date(Date.UTC(year, monthIndex, 15))).replace(/\.$/, "");
}

export function getPeriodRange(period, date) {
  const { year, month } = getPragueDateParts(date);
  if (period === "year") return [pragueMonthStart(year, 0), pragueMonthStart(year + 1, 0)];
  if (period !== "season") return null;

  const seasonStartYear = month >= 3 ? year : year - 1;
  return [pragueMonthStart(seasonStartYear, 2), pragueMonthStart(year, month)];
}

export function getPeriodLabel(period, date) {
  const { year, month } = getPragueDateParts(date);
  if (period === "total") return "Za celou dobu";
  if (period === "year") return `Rok ${year}`;

  const seasonStartYear = month >= 3 ? year : year - 1;
  const seasonYear = seasonStartYear === year ? String(seasonStartYear) : `${seasonStartYear}–${year}`;
  const currentMonth = new Intl.DateTimeFormat("cs-CZ", { timeZone: PRAGUE_TIME_ZONE, month: "long" }).format(date);
  return `Sezóna ${seasonYear} · březen až ${currentMonth}`;
}

export function getMonthlyCatchSeries(catches, period, date) {
  const { year, month } = getPragueDateParts(date);
  const range = getPeriodRange(period, date);
  const start = range?.[0] ?? pragueMonthStart(year, month - 6);
  const end = range?.[1] ?? pragueMonthStart(year, month);
  const counts = new Map();

  for (const record of catches) {
    const timestamp = Date.parse(record.caughtAt);
    if (!Number.isFinite(timestamp) || timestamp < start.getTime() || timestamp >= end.getTime()) continue;
    const caught = getPragueDateParts(new Date(timestamp));
    const key = `${caught.year}-${String(caught.month).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const months = [];
  const startParts = getPragueDateParts(start);
  let cursorYear = startParts.year;
  let cursorMonth = startParts.month - 1;
  while (pragueMonthStart(cursorYear, cursorMonth).getTime() < end.getTime()) {
    const key = `${cursorYear}-${String(cursorMonth + 1).padStart(2, "0")}`;
    months.push({ key, label: monthLabel(cursorYear, cursorMonth), count: counts.get(key) ?? 0 });
    cursorMonth += 1;
    if (cursorMonth > 11) { cursorMonth = 0; cursorYear += 1; }
  }

  return { months, datedCatchCount: [...counts.values()].reduce((total, count) => total + count, 0) };
}
